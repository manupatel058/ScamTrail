"""Evaluate frozen ScamTrail V1 and V2.

Official metrics use the ICFD-31k validation and test splits at probability
0.50. The 30 conversations in stress_test.py are scored only after both
models are loaded. They are not training data. This script does not fit,
does not edit either model, and does not change the application.
"""

import json
import sys
from pathlib import Path

import joblib
import numpy as np
from datasets import load_dataset
from sklearn.metrics import f1_score, precision_score, recall_score

sys.path.insert(0, str(Path(__file__).resolve().parent))

from stress_test import CONVERSATIONS, THRESHOLD, cumulative
from train import (
    chunk_metrics,
    print_chunk_metrics,
    print_streaming,
    split_arrays,
    streaming_evaluation,
)

DATASET_ID = "rishia2220/icfd-31k"
V1_PATH = Path(__file__).resolve().parent / "models" / "scamtrail_tfidf_logreg.joblib"
V2_PATH = Path(__file__).resolve().parent / "models" / "scamtrail_v2.joblib"
V1_METADATA = Path(__file__).resolve().parent / "models" / "training_metadata.json"
V2_TRAINING = Path(__file__).resolve().parent / "models" / "v2_training.json"
OUTPUT_PATH = Path(__file__).resolve().parent / "models" / "v2_evaluation.json"
BATCH_SIZE = 4000

CARRIER = "Good morning. This is a short note from the office."
LEXICON = [
    "fraud",
    "bank fraud",
    "verification code",
    "password",
    "immediately",
    "suspended",
    "gift card",
    "gift cards",
    "wire transfer",
    "one-time code",
    "urgent",
    "do not hang up",
    "don't hang up",
]


def positive_column(model):
    return list(model.named_steps["clf"].classes_).index(1)


def predict_positive(model, texts):
    column = positive_column(model)
    parts = []
    total = len(texts)
    for start in range(0, total, BATCH_SIZE):
        batch = texts[start : start + BATCH_SIZE]
        parts.append(model.predict_proba(batch)[:, column])
        done = min(start + BATCH_SIZE, total)
        print(f"  scored {done:,} / {total:,}", flush=True)
    return np.concatenate(parts)


def probability(model, text):
    column = positive_column(model)
    return float(model.predict_proba([text])[0, column])


def official_report(model, split, name):
    print(f"\nscoring {name} with {type(model).__name__}", flush=True)
    probabilities = predict_positive(model, split["text"])
    metrics = chunk_metrics(split["y"], probabilities)
    streaming = streaming_evaluation(
        split["uids"], split["timestamps"], split["y"], probabilities
    )
    return metrics, streaming


def ood_rows(model):
    rows = []
    for conversation in CONVERSATIONS:
        text = cumulative(conversation["turns"], len(conversation["turns"]))
        score = probability(model, text)
        rows.append(
            {
                "id": conversation["id"],
                "kind": conversation["kind"],
                "expected": conversation["expected"],
                "final_probability": round(score, 6),
                "predicted_scam": score >= THRESHOLD,
            }
        )
    return rows


def ood_summary(rows):
    y_true = [1 if row["expected"] == "SCAM" else 0 for row in rows]
    predicted = [1 if row["predicted_scam"] else 0 for row in rows]
    detected = sum(true == 1 and guess == 1 for true, guess in zip(y_true, predicted))
    alarms = sum(true == 0 and guess == 1 for true, guess in zip(y_true, predicted))
    return {
        "threshold": THRESHOLD,
        "decision": "final turn",
        "scams_detected": detected,
        "scams_total": 20,
        "normal_false_alarms": alarms,
        "normal_total": 10,
        "precision": round(float(precision_score(y_true, predicted, zero_division=0)), 6),
        "recall": round(float(recall_score(y_true, predicted, zero_division=0)), 6),
        "f1": round(float(f1_score(y_true, predicted, zero_division=0)), 6),
        "probabilities": rows,
    }


def lexicon_pairs(v1_model, v2_model):
    rows = []
    v1_base = probability(v1_model, CARRIER)
    v2_base = probability(v2_model, CARRIER)
    for phrase in LEXICON:
        probed = f"{CARRIER} {phrase}."
        v1_score = probability(v1_model, probed)
        v2_score = probability(v2_model, probed)
        rows.append(
            {
                "phrase": phrase,
                "carrier": CARRIER,
                "v1_carrier": round(v1_base, 6),
                "v1_with_phrase": round(v1_score, 6),
                "v1_delta": round(v1_score - v1_base, 6),
                "v2_carrier": round(v2_base, 6),
                "v2_with_phrase": round(v2_score, 6),
                "v2_delta": round(v2_score - v2_base, 6),
            }
        )
    return rows


def print_ood(title, summary):
    print(f"\n=== OOD final turn: {title} ===")
    print(
        f"scams detected: {summary['scams_detected']} / {summary['scams_total']}"
    )
    print(
        "normal false alarms: "
        f"{summary['normal_false_alarms']} / {summary['normal_total']}"
    )
    print(f"precision: {summary['precision']:.4f}")
    print(f"recall:    {summary['recall']:.4f}")
    print(f"f1:        {summary['f1']:.4f}")
    print("final probabilities:")
    for row in summary["probabilities"]:
        print(f"  {row['id']}: {row['final_probability']:.4f}  {row['expected']}")


def print_lexicon(rows):
    print("\n=== lexicon minimal pairs ===")
    print(f"carrier: {CARRIER}")
    print("phrase                  v1 delta    v2 delta    v2 probability")
    for row in rows:
        print(
            f"{row['phrase']:<22} "
            f"{row['v1_delta']:+.4f}    "
            f"{row['v2_delta']:+.4f}    "
            f"{row['v2_with_phrase']:.4f}"
        )


def main():
    if len(CONVERSATIONS) != 30:
        raise SystemExit(f"Expected 30 held-out conversations, found {len(CONVERSATIONS)}")
    if not V2_PATH.exists():
        raise SystemExit(f"V2 model is missing: {V2_PATH}")
    v1_meta = json.loads(V1_METADATA.read_text(encoding="utf-8"))
    v2_training = json.loads(V2_TRAINING.read_text(encoding="utf-8"))
    v1_before = V1_PATH.stat()
    v2_before = V2_PATH.stat()

    print("loading frozen models")
    v1_model = joblib.load(V1_PATH)
    v2_model = joblib.load(V2_PATH)
    dataset = load_dataset(DATASET_ID)
    validation = split_arrays(dataset["validation"])
    test = split_arrays(dataset["test"])
    print(
        "Official test NO rows are pre-onset chunks inside fraud conversations, "
        "not benign calls. Test specificity is not performance on normal conversations."
    )

    validation_metrics, validation_streaming = official_report(v2_model, validation, "validation")
    print_chunk_metrics("V2 validation", validation_metrics)
    print_streaming("V2 validation", validation_streaming)
    test_metrics, test_streaming = official_report(v2_model, test, "test")
    print_chunk_metrics("V2 test", test_metrics)
    print_streaming("V2 test", test_streaming)

    print("\nscoring held-out 30-conversation stress test")
    v1_ood = ood_summary(ood_rows(v1_model))
    v2_ood = ood_summary(ood_rows(v2_model))
    print_ood("V1", v1_ood)
    print_ood("V2", v2_ood)
    lexicon = lexicon_pairs(v1_model, v2_model)
    print_lexicon(lexicon)

    if (v1_before.st_size, v1_before.st_mtime_ns) != (
        V1_PATH.stat().st_size,
        V1_PATH.stat().st_mtime_ns,
    ):
        raise SystemExit("V1 model file changed during evaluation")
    if (v2_before.st_size, v2_before.st_mtime_ns) != (
        V2_PATH.stat().st_size,
        V2_PATH.stat().st_mtime_ns,
    ):
        raise SystemExit("V2 model file changed during evaluation")

    report = {
        "threshold": 0.50,
        "threshold_note": (
            "Comparison uses 0.50. The threshold was not lowered to improve "
            "the out-of-distribution stress test."
        ),
        "v1_official": {
            "source": "ml/models/training_metadata.json from the V1 training run",
            "validation_metrics": v1_meta["validation_metrics"],
            "test_metrics": v1_meta["test_metrics"],
            "streaming_validation": v1_meta["streaming_validation"],
            "streaming_test": v1_meta["streaming_test"],
        },
        "v2_official": {
            "validation_metrics": validation_metrics,
            "test_metrics": test_metrics,
            "streaming_validation": validation_streaming,
            "streaming_test": test_streaming,
        },
        "v1_ood": v1_ood,
        "v2_ood": v2_ood,
        "previously_reported_v1_ood": {
            "scams_detected": 0,
            "scams_total": 20,
            "normal_false_alarms": 0,
            "normal_total": 10,
            "note": "Reported from the earlier V1 stress test. This file also stores a fresh V1 rescore.",
        },
        "lexicon_minimal_pairs": lexicon,
        "training_snapshot_counts": {
            "original_icfd_training_chunks": v2_training["original_icfd_training_chunks"],
            "retained_training_chunks": v2_training["retained_training_chunks"],
            "percentage_retained": v2_training["percentage_retained"],
            "average_retained_snapshots_per_conversation": v2_training[
                "average_retained_snapshots_per_conversation"
            ],
        },
        "conversation_weighting_strategy": v2_training["sample_weights"]["formula"],
        "sample_weight_summary": {
            key: value
            for key, value in v2_training["sample_weights"].items()
            if key != "formula"
        },
        "feature_configuration": v2_training["features"],
        "classifier": v2_training["classifier"],
        "external_data": v2_training["external_data"],
        "training_duration_seconds": v2_training["training_duration_seconds"],
        "model_bytes": {
            "v1": v2_training["v1_bytes"],
            "v2": v2_training["v2_bytes"],
        },
        "snapshot_strategy": v2_training["snapshot_strategy"],
        "limitations": [
            "V2 training used the official ICFD train split only. Validation and test were not fit.",
            "Official validation contains fraud case types only. Official test contains Clear Fraud only. NO labels there are pre-onset chunks, not benign calls.",
            "No external labeled scam or legitimate dataset was available locally, so V2 is ICFD-only.",
            "The 30 stress-test conversations were scored after training and were not used to fit, augment, or choose features.",
            "Character and word features share one linear model, so a phrase does not have a single coefficient.",
            "V2 is not connected to /api/risk, the React app, or Gemini.",
            "No production threshold was selected.",
        ],
    }
    OUTPUT_PATH.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(f"\nwrote: {OUTPUT_PATH}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
