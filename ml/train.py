"""Train ScamTrail's first text fraud classifier.

Fits a TF-IDF + logistic regression pipeline on the official ICFD-31k train
split only. Validation and test are used for evaluation and are never fit.
This script does not create a new split and does not change the application.
"""

import json
import statistics
import sys
import time
from collections import Counter, defaultdict
from datetime import date
from pathlib import Path

import joblib
import numpy as np
import sklearn
from datasets import load_dataset
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import (
    accuracy_score,
    confusion_matrix,
    f1_score,
    precision_score,
    recall_score,
    roc_auc_score,
)
from sklearn.pipeline import Pipeline

DATASET_ID = "rishia2220/icfd-31k"
DATASET_CONFIG = "default"
MODEL_PATH = Path(__file__).resolve().parent / "models" / "scamtrail_tfidf_logreg.joblib"
METADATA_PATH = Path(__file__).resolve().parent / "models" / "training_metadata.json"
THRESHOLDS = (0.30, 0.40, 0.50, 0.60, 0.70, 0.80)
DETECTION_THRESHOLD = 0.50

# liblinear is sklearn's coordinate solver for smaller problems. This matrix is
# about 712,316 rows by up to 100,000 sparse features, so saga is the solver
# that fits binary L2 logistic regression at this size.
CLASSIFIER = LogisticRegression(
    max_iter=1000,
    class_weight="balanced",
    solver="saga",
    l1_ratio=0.0,
    random_state=42,
)


def label_counts(verdicts):
    counts = Counter(verdicts)
    unexpected = sorted(set(counts) - {"NO", "YES"})
    if unexpected:
        raise ValueError(f"Unexpected final_verdict values: {unexpected}")
    return {"NO": counts["NO"], "YES": counts["YES"]}


def to_binary(verdicts):
    return np.fromiter((1 if verdict == "YES" else 0 for verdict in verdicts), dtype=np.int8)


def build_pipeline():
    return Pipeline(
        [
            (
                "tfidf",
                TfidfVectorizer(
                    ngram_range=(1, 2),
                    min_df=3,
                    max_df=0.98,
                    sublinear_tf=True,
                    max_features=100000,
                ),
            ),
            ("clf", CLASSIFIER),
        ]
    )


def rounded(value):
    return round(float(value), 6)


def chunk_metrics(y_true, probabilities):
    predicted = (probabilities >= DETECTION_THRESHOLD).astype(np.int8)
    matrix = confusion_matrix(y_true, predicted, labels=[0, 1])
    return {
        "accuracy": rounded(accuracy_score(y_true, predicted)),
        "precision": rounded(precision_score(y_true, predicted, zero_division=0)),
        "recall": rounded(recall_score(y_true, predicted, zero_division=0)),
        "f1": rounded(f1_score(y_true, predicted, zero_division=0)),
        "roc_auc": rounded(roc_auc_score(y_true, probabilities)),
        "confusion_matrix": {
            "labels": ["NO", "YES"],
            "matrix": matrix.tolist(),
        },
        "class_distribution": {
            "NO": int(np.sum(y_true == 0)),
            "YES": int(np.sum(y_true == 1)),
        },
    }


def print_chunk_metrics(title, metrics):
    distribution = metrics["class_distribution"]
    matrix = metrics["confusion_matrix"]["matrix"]
    print(f"\n=== {title} ===")
    print(f"class distribution: NO {distribution['NO']:,}  YES {distribution['YES']:,}")
    print(f"accuracy:  {metrics['accuracy']:.4f}")
    print(f"precision: {metrics['precision']:.4f}")
    print(f"recall:    {metrics['recall']:.4f}")
    print(f"f1:        {metrics['f1']:.4f}")
    print(f"roc_auc:   {metrics['roc_auc']:.4f}")
    print("confusion matrix (rows true NO/YES, columns predicted NO/YES):")
    print(f"  [[{matrix[0][0]:,}, {matrix[0][1]:,}],")
    print(f"   [{matrix[1][0]:,}, {matrix[1][1]:,}]]")


def threshold_table(y_true, probabilities):
    rows = []
    for threshold in THRESHOLDS:
        predicted = (probabilities >= threshold).astype(np.int8)
        row = {
            "threshold": threshold,
            "precision": rounded(precision_score(y_true, predicted, zero_division=0)),
            "recall": rounded(recall_score(y_true, predicted, zero_division=0)),
            "f1": rounded(f1_score(y_true, predicted, zero_division=0)),
        }
        rows.append(row)
    return rows


def print_thresholds(rows):
    print("\n=== validation thresholds (not used to choose a production cutoff) ===")
    print("threshold  precision  recall     f1")
    for row in rows:
        print(
            f"{row['threshold']:.2f}       "
            f"{row['precision']:.4f}     "
            f"{row['recall']:.4f}     "
            f"{row['f1']:.4f}"
        )


def streaming_evaluation(uids, timestamps, y_true, probabilities):
    grouped = defaultdict(list)
    for index, (uid, timestamp, label, probability) in enumerate(
        zip(uids, timestamps, y_true, probabilities)
    ):
        grouped[uid].append((int(timestamp), index, int(label), float(probability)))

    early = at_onset = after = never = 0
    delays = []
    fraud_conversations = 0
    no_onset = 0
    max_probabilities = []
    final_probabilities = []

    for rows in grouped.values():
        rows.sort()
        max_probabilities.append(max(probability for _, _, _, probability in rows))
        final_probabilities.append(rows[-1][3])
        onset = next((timestamp for timestamp, _, label, _ in rows if label == 1), None)
        detection = next(
            (
                timestamp
                for timestamp, _, _, probability in rows
                if probability >= DETECTION_THRESHOLD
            ),
            None,
        )
        if onset is None:
            no_onset += 1
            continue
        fraud_conversations += 1
        if detection is None:
            never += 1
            continue
        delays.append(detection - onset)
        if detection < onset:
            early += 1
        elif detection == onset:
            at_onset += 1
        else:
            after += 1

    def percent(count):
        if fraud_conversations == 0:
            return None
        return rounded(100 * count / fraud_conversations)

    return {
        "conversations": len(grouped),
        "fraud_conversations_with_yes_onset": fraud_conversations,
        "conversations_without_yes_onset": no_onset,
        "early_model_detection_percent": percent(early),
        "at_ground_truth_onset_percent": percent(at_onset),
        "after_ground_truth_onset_percent": percent(after),
        "never_detected_percent": percent(never),
        "early_model_detection_count": early,
        "at_ground_truth_onset_count": at_onset,
        "after_ground_truth_onset_count": after,
        "never_detected_count": never,
        "median_detection_delay_seconds": (
            None if not delays else rounded(statistics.median(delays))
        ),
        "detected_conversations": len(delays),
        "median_max_predicted_probability": rounded(statistics.median(max_probabilities)),
        "median_final_predicted_probability": rounded(statistics.median(final_probabilities)),
        "threshold": DETECTION_THRESHOLD,
        "note": (
            "A probability crossing before the ground-truth YES chunk is early "
            "model detection. It is not automatically a successful early detection, "
            "because it can also be an early false alarm."
        ),
    }


def print_streaming(title, report):
    print(f"\n=== streaming: {title} ===")
    print(
        "fraud conversations with a YES onset: "
        f"{report['fraud_conversations_with_yes_onset']:,}"
    )
    print(f"conversations with no YES chunk: {report['conversations_without_yes_onset']:,}")
    print(f"early model detection: {report['early_model_detection_percent']:.2f}%")
    print(f"at ground-truth onset: {report['at_ground_truth_onset_percent']:.2f}%")
    print(f"after ground-truth onset: {report['after_ground_truth_onset_percent']:.2f}%")
    print(f"never detected: {report['never_detected_percent']:.2f}%")
    print(
        "median detection delay (detection timestamp - onset timestamp, seconds, "
        f"over {report['detected_conversations']:,} detected conversations): "
        f"{report['median_detection_delay_seconds']}"
    )
    print(report["note"])


def split_arrays(split):
    return {
        "text": split["cumulative_text"],
        "verdicts": split["final_verdict"],
        "y": to_binary(split["final_verdict"]),
        "uids": split["conversation_uid"],
        "timestamps": split["chunk_timestamp"],
        "case_types": Counter(split["case_type"]),
    }


def json_ready(value):
    if isinstance(value, dict):
        return {key: json_ready(item) for key, item in value.items()}
    if isinstance(value, (list, tuple)):
        return [json_ready(item) for item in value]
    if isinstance(value, (np.integer, np.floating)):
        return value.item()
    return value


def main():
    print(f"dataset: {DATASET_ID}")
    print(f"configuration: {DATASET_CONFIG}")
    print("fitting split: train")
    print("solver: saga (binary L2). liblinear is not used at this row count.")
    dataset = load_dataset(DATASET_ID)

    train = split_arrays(dataset["train"])
    n_chunks = len(train["text"])
    n_conversations = len(set(train["uids"]))
    train_labels = label_counts(train["verdicts"])
    average_chunks = n_chunks / n_conversations
    print(
        f"\n{n_conversations:,} training conversations represented by "
        f"{n_chunks:,} streaming snapshots."
    )
    print(f"average chunks per conversation: {average_chunks:.2f}")
    print(f"training class distribution: NO {train_labels['NO']:,}  YES {train_labels['YES']:,}")

    pipeline = build_pipeline()
    started = time.perf_counter()
    pipeline.fit(train["text"], train["y"])
    duration = time.perf_counter() - started
    vocabulary_size = len(pipeline.named_steps["tfidf"].vocabulary_)
    iterations = int(np.max(pipeline.named_steps["clf"].n_iter_))
    print(f"\ntraining chunks: {n_chunks:,}")
    print(f"unique training conversations: {n_conversations:,}")
    print(f"vocabulary size: {vocabulary_size:,}")
    print(f"training duration seconds: {duration:.1f}")
    print(f"logistic regression iterations: {iterations}")

    MODEL_PATH.parent.mkdir(parents=True, exist_ok=True)
    joblib.dump(pipeline, MODEL_PATH)
    train_text_released = train["text"]
    del train_text_released
    train["text"] = None

    validation = split_arrays(dataset["validation"])
    validation_probabilities = pipeline.predict_proba(validation["text"])[:, 1]
    validation_metrics = chunk_metrics(validation["y"], validation_probabilities)
    print_chunk_metrics("validation chunks", validation_metrics)
    print("validation case types:", dict(validation["case_types"]))
    print(
        "WARNING: validation case types are fraud categories "
        "(Clear Fraud and Subtle Fraud in this dataset). Early chunks can still "
        "be labeled NO. This split is useful for streaming fraud-onset detection. "
        "It is not a complete evaluation of false positives on normal conversations."
    )

    thresholds = threshold_table(validation["y"], validation_probabilities)
    print_thresholds(thresholds)
    print("No production threshold was selected.")

    validation_streaming = streaming_evaluation(
        validation["uids"],
        validation["timestamps"],
        validation["y"],
        validation_probabilities,
    )
    print_streaming("validation", validation_streaming)
    del validation_probabilities
    validation["text"] = None

    test = split_arrays(dataset["test"])
    test_probabilities = pipeline.predict_proba(test["text"])[:, 1]
    test_metrics = chunk_metrics(test["y"], test_probabilities)
    print_chunk_metrics("test chunks", test_metrics)
    print("test case types:", dict(test["case_types"]))
    print(
        "WARNING: the test split's case types are Clear Fraud only. NO labels in "
        "this split are pre-onset chunks of fraud conversations. They are not "
        "normal or legitimate conversations. Test specificity is not performance "
        "on benign calls."
    )
    test_streaming = streaming_evaluation(
        test["uids"],
        test["timestamps"],
        test["y"],
        test_probabilities,
    )
    print_streaming("test", test_streaming)

    metadata = {
        "model_type": "TfidfVectorizer + LogisticRegression Pipeline",
        "dataset_name": DATASET_ID,
        "dataset_configuration": DATASET_CONFIG,
        "training_split": "train",
        "number_of_training_chunks": n_chunks,
        "number_of_unique_training_conversations": n_conversations,
        "average_chunks_per_training_conversation": round(average_chunks, 2),
        "training_label_counts": train_labels,
        "label_mapping": {"NO": 0, "YES": 1},
        "input_column": "cumulative_text",
        "target_column": "final_verdict",
        "tfidf_settings": {
            "ngram_range": [1, 2],
            "min_df": 3,
            "max_df": 0.98,
            "sublinear_tf": True,
            "max_features": 100000,
        },
        "logistic_regression_settings": {
            "max_iter": 1000,
            "class_weight": "balanced",
            "solver": "saga",
            "l1_ratio": 0.0,
            "penalty": "l2",
            "random_state": 42,
            "iterations_run": iterations,
            "solver_reason": (
                "saga is used instead of liblinear because the official train "
                "split has 712,316 sparse streaming rows."
            ),
        },
        "vocabulary_size": vocabulary_size,
        "scikit_learn_version": sklearn.__version__,
        "training_date": date.today().isoformat(),
        "training_duration_seconds": round(duration, 1),
        "validation_metrics": validation_metrics,
        "test_metrics": test_metrics,
        "validation_threshold_analysis": thresholds,
        "threshold_selection": "No production threshold was selected. Test was not used for tuning.",
        "streaming_validation": validation_streaming,
        "streaming_test": test_streaming,
        "model_path": str(MODEL_PATH),
        "limitations": [
            "Training used 20,996 conversations represented by 712,316 streaming snapshots. The chunks are not independent conversations.",
            "Only cumulative_text was used as input. Later chunks repeat earlier text from the same conversation.",
            "Validation contains fraud case types only. It can measure streaming onset detection and is not a complete false-positive evaluation on normal conversations.",
            "Test contains Clear Fraud conversations only. NO labels there are pre-onset chunks, not benign calls. Test specificity is not performance on normal conversations.",
            "The Hugging Face load has no cross_domain split.",
            "No production probability threshold was selected, and the threshold table was computed on validation only.",
            "The saved model is not connected to the React app, Gemini, or the JavaScript risk engine.",
        ],
    }
    METADATA_PATH.write_text(json.dumps(json_ready(metadata), indent=2) + "\n")
    print(f"\nsaved model: {MODEL_PATH}")
    print(f"model bytes: {MODEL_PATH.stat().st_size}")
    print(f"saved metadata: {METADATA_PATH}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
