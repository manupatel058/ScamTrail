"""Train ScamTrail Model V2.

Fits on the official ICFD-31k train split only. Validation and test are
never used here. V1 at ml/models/scamtrail_tfidf_logreg.joblib is not opened
for writing and is not replaced.

External single-message files can be added later as JSONL in ml/external/.
Each row is one message, {"text": "...", "label": "YES" or "NO"}. Those rows
stay single messages. This script does not download, scrape, or invent data.
"""

import gc
import json
import sys
import time
from collections import defaultdict
from datetime import date
from pathlib import Path

import joblib
import numpy as np
import pyarrow as pa
import sklearn
from datasets import load_dataset
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.pipeline import FeatureUnion, Pipeline

DATASET_ID = "rishia2220/icfd-31k"
DATASET_CONFIG = "default"
V1_PATH = Path(__file__).resolve().parent / "models" / "scamtrail_tfidf_logreg.joblib"
MODEL_PATH = Path(__file__).resolve().parent / "models" / "scamtrail_v2.joblib"
TRAINING_PATH = Path(__file__).resolve().parent / "models" / "v2_training.json"
EXTERNAL_DIR = Path(__file__).resolve().parent / "external"

# Fifteen seconds is a fixed progression interval. ICFD chunks are usually a
# few seconds apart, so this keeps the shape of a call without keeping every
# near-duplicate snapshot. It was not chosen from validation or test scores.
SNAPSHOT_INTERVAL_SECONDS = 15
WORD_MAX_FEATURES = 50000
CHAR_MAX_FEATURES = 20000

WEIGHT_STRATEGY = (
    "Each retained snapshot in conversation i gets base weight 1/n_i, so the "
    "conversation's base weights sum to 1. Let M_k be the sum of base weights "
    "on label k. class_factor_k = (M_0 + M_1) / (2 * M_k), which makes the "
    "total weight on YES equal the total weight on NO. "
    "unnormalized = base * class_factor[label]. "
    "final = unnormalized / mean(unnormalized), so the mean sample weight is 1 "
    "and the default L2 penalty stays on the usual scale. The global rescale "
    "does not change conversation ratios or the equal class totals. "
    "class_weight is left unset, because sklearn's balanced mode uses row "
    "counts and would undo the conversation weights. A mixed conversation's "
    "total moves with its YES/NO mix, because pre-onset NO snapshots are not "
    "given the fraud class factor."
)


def retained_local_positions(timestamps, labels, interval_seconds):
    """Positions to keep, in time order, within one conversation.

    Always keeps the first snapshot, the final snapshot, the first YES
    snapshot, and the snapshots immediately before and after that onset.
    Also keeps a later snapshot once the timestamp has moved at least
    interval_seconds past the last kept snapshot. Earlier snapshots are
    existing cumulative_text rows, so they do not contain later text.
    """
    count = len(timestamps)
    order = sorted(range(count), key=lambda index: (int(timestamps[index]), index))
    keep = {order[0], order[-1]}
    onset_pos = next(
        (pos for pos, index in enumerate(order) if int(labels[index]) == 1),
        None,
    )
    if onset_pos is not None:
        keep.add(order[onset_pos])
        if onset_pos > 0:
            keep.add(order[onset_pos - 1])
        if onset_pos + 1 < count:
            keep.add(order[onset_pos + 1])
    last_time = int(timestamps[order[0]])
    for index in order:
        timestamp = int(timestamps[index])
        if index in keep:
            last_time = timestamp
            continue
        if timestamp - last_time >= interval_seconds:
            keep.add(index)
            last_time = timestamp
    return [index for index in order if index in keep]


def assert_retention_examples():
    short_times = [0, 3, 6, 9, 12, 15, 18, 21]
    short_labels = [0, 0, 0, 1, 1, 1, 1, 1]
    short_kept = retained_local_positions(short_times, short_labels, 15)
    if short_kept != [0, 2, 3, 4, 7]:
        raise RuntimeError(f"Unexpected short retention: {short_kept}")
    long_times = list(range(0, 64, 3))
    long_labels = [0] * len(long_times)
    long_labels[-1] = 1
    long_kept = retained_local_positions(long_times, long_labels, 15)
    kept_times = [long_times[index] for index in long_kept]
    if kept_times[0] != 0 or kept_times[-1] != 63:
        raise RuntimeError(f"Endpoints missing: {kept_times}")
    if 60 not in kept_times or 63 not in kept_times:
        raise RuntimeError(f"Onset neighborhood missing: {kept_times}")


def conversation_balanced_weights(conversation_ids, labels):
    counts = {}
    for conversation_id in conversation_ids:
        counts[conversation_id] = counts.get(conversation_id, 0) + 1
    base = np.fromiter(
        (1.0 / counts[conversation_id] for conversation_id in conversation_ids),
        dtype=np.float64,
        count=len(conversation_ids),
    )
    labels = np.asarray(labels)
    mass = {0: float(base[labels == 0].sum()), 1: float(base[labels == 1].sum())}
    if mass[0] <= 0 or mass[1] <= 0:
        raise RuntimeError(f"Both classes need retained weight, got {mass}")
    total_mass = mass[0] + mass[1]
    class_factor = {label: total_mass / (2.0 * mass[label]) for label in (0, 1)}
    unnormalized = base * np.fromiter(
        (class_factor[int(label)] for label in labels),
        dtype=np.float64,
        count=len(labels),
    )
    final = unnormalized / float(unnormalized.mean())
    totals = {}
    for conversation_id, weight in zip(conversation_ids, final):
        totals[conversation_id] = totals.get(conversation_id, 0.0) + float(weight)
    total_values = list(totals.values())
    return final, {
        "formula": WEIGHT_STRATEGY,
        "base_class_mass": {"NO": mass[0], "YES": mass[1]},
        "class_factor": {"NO": class_factor[0], "YES": class_factor[1]},
        "mean_final_weight": float(final.mean()),
        "sum_final_weight_NO": float(final[labels == 0].sum()),
        "sum_final_weight_YES": float(final[labels == 1].sum()),
        "conversation_total_weight_min": min(total_values),
        "conversation_total_weight_median": float(np.median(total_values)),
        "conversation_total_weight_max": max(total_values),
    }


def load_external_messages():
    """Read already-local single-message JSONL. Never synthesizes rows."""
    if not EXTERNAL_DIR.exists():
        return []
    rows = []
    for path in sorted(EXTERNAL_DIR.glob("*.jsonl")):
        with path.open(encoding="utf-8") as handle:
            for line_number, line in enumerate(handle, start=1):
                if not line.strip():
                    continue
                row = json.loads(line)
                if "turns" in row or "conversation" in row:
                    raise RuntimeError(
                        f"{path}:{line_number} looks like a multi-turn conversation. "
                        "External data must be one labeled message per row."
                    )
                label = row.get("label")
                text = row.get("text")
                if label not in {"YES", "NO"} or not isinstance(text, str) or not text.strip():
                    raise RuntimeError(f"{path}:{line_number} needs text and label YES or NO")
                rows.append(
                    {
                        "text": text,
                        "label": 1 if label == "YES" else 0,
                        "group": f"external:{path.name}:{line_number}",
                    }
                )
    return rows


def build_pipeline():
    # saga fits binary L2 logistic regression on a large sparse matrix.
    # liblinear is the small-problem solver. class_weight stays unset because
    # conversation and class balance are both carried by sample_weight.
    word = TfidfVectorizer(
        analyzer="word",
        ngram_range=(1, 2),
        min_df=3,
        sublinear_tf=True,
        max_features=WORD_MAX_FEATURES,
        dtype=np.float32,
    )
    char = TfidfVectorizer(
        analyzer="char_wb",
        ngram_range=(3, 5),
        min_df=3,
        sublinear_tf=True,
        max_features=CHAR_MAX_FEATURES,
        dtype=np.float32,
    )
    classifier = LogisticRegression(
        max_iter=1000,
        solver="saga",
        l1_ratio=0.0,
        random_state=42,
    )
    return Pipeline(
        [
            ("features", FeatureUnion([("word", word), ("char", char)])),
            ("clf", classifier),
        ]
    )


def select_training_indices(labels, uids, timestamps):
    grouped = defaultdict(list)
    for index, uid in enumerate(uids):
        grouped[uid].append(index)
    kept = []
    for uid in sorted(grouped):
        indices = grouped[uid]
        indices.sort(key=lambda index: (timestamps[index], index))
        local_times = [timestamps[index] for index in indices]
        local_labels = [int(labels[index]) for index in indices]
        local_kept = retained_local_positions(
            local_times, local_labels, SNAPSHOT_INTERVAL_SECONDS
        )
        kept.extend(indices[position] for position in local_kept)
    return kept


def main():
    assert_retention_examples()
    if not V1_PATH.exists():
        raise SystemExit(f"V1 model is missing: {V1_PATH}")
    v1_before = V1_PATH.stat()
    external = load_external_messages()
    if not external:
        print("External dataset required")
        print(
            "Local search found ICFD-31k only. Example JSON and baseline prediction "
            "files under data/icfd31k are the same dataset or model outputs, so they "
            "were not added. No file was downloaded. Training continues on ICFD only."
        )
    else:
        print(f"external single-message rows: {len(external):,}")

    print(f"dataset: {DATASET_ID}")
    print(f"configuration: {DATASET_CONFIG}")
    print("fitting split: train")
    print(f"snapshot interval seconds: {SNAPSHOT_INTERVAL_SECONDS}")
    dataset = load_dataset(DATASET_ID, DATASET_CONFIG)
    train = dataset["train"]
    verdicts = list(train["final_verdict"])
    if set(verdicts) - {"NO", "YES"}:
        raise SystemExit("Unexpected final_verdict values in train")
    labels = np.fromiter(
        (1 if verdict == "YES" else 0 for verdict in verdicts),
        dtype=np.int8,
        count=len(verdicts),
    )
    uids = list(train["conversation_uid"])
    timestamps = [int(value) for value in train["chunk_timestamp"]]
    original_chunks = len(uids)
    original_conversations = len(set(uids))
    print(f"original ICFD training chunks: {original_chunks:,}", flush=True)
    print(f"original ICFD training conversations: {original_conversations:,}", flush=True)

    kept = select_training_indices(labels, uids, timestamps)
    print(f"selected snapshot indexes: {len(kept):,}", flush=True)
    kept_texts = (
        train.data.column("cumulative_text").take(pa.array(kept, type=pa.int64())).to_pylist()
    )
    kept_labels = np.array(labels[kept], dtype=np.int8, copy=True)
    kept_uids = [uids[index] for index in kept]
    retained_chunks = len(kept_texts)
    retained_conversations = len(set(kept_uids))
    if retained_conversations != original_conversations:
        raise SystemExit("Retention dropped a conversation")
    retained_percent = 100.0 * retained_chunks / original_chunks
    average_retained = retained_chunks / retained_conversations
    print(f"retained training chunks: {retained_chunks:,}")
    print(f"percentage retained: {retained_percent:.2f}%")
    print(f"average retained snapshots per conversation: {average_retained:.2f}")
    print(
        "retained labels: "
        f"NO {int(np.sum(kept_labels == 0)):,}  YES {int(np.sum(kept_labels == 1)):,}"
    )
    del verdicts, labels, uids, timestamps, dataset, train
    gc.collect()

    for row in external:
        kept_texts.append(row["text"])
        kept_labels = np.append(kept_labels, row["label"])
        kept_uids.append(row["group"])
    if external:
        kept_labels = kept_labels.astype(np.int8, copy=False)

    weights, weight_report = conversation_balanced_weights(kept_uids, kept_labels)
    print("sample-weight formula:")
    print(WEIGHT_STRATEGY)
    print(
        "class factors: "
        f"NO {weight_report['class_factor']['NO']:.4f}  "
        f"YES {weight_report['class_factor']['YES']:.4f}"
    )
    print(
        "final weight sums: "
        f"NO {weight_report['sum_final_weight_NO']:.1f}  "
        f"YES {weight_report['sum_final_weight_YES']:.1f}"
    )

    pipeline = build_pipeline()
    started = time.perf_counter()
    pipeline.fit(kept_texts, kept_labels, clf__sample_weight=weights)
    duration = time.perf_counter() - started
    iterations = int(np.max(pipeline.named_steps["clf"].n_iter_))
    word_size = len(pipeline.named_steps["features"].transformer_list[0][1].vocabulary_)
    char_size = len(pipeline.named_steps["features"].transformer_list[1][1].vocabulary_)
    print(f"training duration seconds: {duration:.1f}")
    print(f"logistic regression iterations: {iterations}")
    print(f"word vocabulary: {word_size:,}")
    print(f"character vocabulary: {char_size:,}")

    MODEL_PATH.parent.mkdir(parents=True, exist_ok=True)
    joblib.dump(pipeline, MODEL_PATH)
    model_bytes = MODEL_PATH.stat().st_size
    v1_after = V1_PATH.stat()
    if (v1_before.st_size, v1_before.st_mtime_ns) != (v1_after.st_size, v1_after.st_mtime_ns):
        raise SystemExit("V1 model file changed during V2 training")
    print(f"saved: {MODEL_PATH}")
    print(f"model bytes: {model_bytes:,}")
    print(f"V1 unchanged: {V1_PATH.name} {v1_after.st_size:,} bytes")

    record = {
        "model_path": str(MODEL_PATH),
        "v1_model_path": str(V1_PATH),
        "v1_bytes": v1_after.st_size,
        "v2_bytes": model_bytes,
        "dataset_name": DATASET_ID,
        "dataset_configuration": DATASET_CONFIG,
        "training_split": "train",
        "input_column": "cumulative_text",
        "target_column": "final_verdict",
        "label_mapping": {"NO": 0, "YES": 1},
        "group_column": "conversation_uid",
        "external_data": (
            "External dataset required" if not external else "local JSONL in ml/external"
        ),
        "external_rows": len(external),
        "original_icfd_training_chunks": original_chunks,
        "retained_training_chunks": retained_chunks,
        "percentage_retained": round(retained_percent, 4),
        "retained_conversations": retained_conversations,
        "average_retained_snapshots_per_conversation": round(average_retained, 4),
        "retained_label_counts": {
            "NO": int(np.sum(kept_labels == 0)),
            "YES": int(np.sum(kept_labels == 1)),
        },
        "snapshot_strategy": {
            "interval_seconds": SNAPSHOT_INTERVAL_SECONDS,
            "always_keep": [
                "first snapshot",
                "final snapshot",
                "first YES snapshot",
                "snapshot immediately before onset",
                "snapshot immediately after onset",
            ],
            "additional": (
                "A later snapshot is kept when chunk_timestamp has advanced "
                f"at least {SNAPSHOT_INTERVAL_SECONDS} seconds since the last kept snapshot."
            ),
        },
        "sample_weights": weight_report,
        "features": {
            "word": {
                "analyzer": "word",
                "ngram_range": [1, 2],
                "min_df": 3,
                "sublinear_tf": True,
                "max_features": WORD_MAX_FEATURES,
                "vocabulary_size": word_size,
            },
            "char": {
                "analyzer": "char_wb",
                "ngram_range": [3, 5],
                "min_df": 3,
                "sublinear_tf": True,
                "max_features": CHAR_MAX_FEATURES,
                "vocabulary_size": char_size,
            },
        },
        "classifier": {
            "solver": "saga",
            "l1_ratio": 0.0,
            "penalty": "l2",
            "class_weight": None,
            "max_iter": 1000,
            "random_state": 42,
            "iterations_run": iterations,
            "sample_weight": True,
        },
        "scikit_learn_version": sklearn.__version__,
        "training_date": date.today().isoformat(),
        "training_duration_seconds": round(duration, 1),
    }
    TRAINING_PATH.write_text(json.dumps(record, indent=2) + "\n", encoding="utf-8")
    print(f"wrote: {TRAINING_PATH}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
