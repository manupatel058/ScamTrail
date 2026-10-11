"""Inspect the official ICFD-31k dataset from Hugging Face.

This script only downloads and describes the dataset. It does not train a model
and it does not create a new train/test split.

The download stays in the default Hugging Face cache under the user home
directory, not inside this repository.
"""

import json
import sys

from datasets import get_dataset_config_names, load_dataset

DATASET_ID = "rishia2220/icfd-31k"
LABEL_NAME_PARTS = ("verdict", "label", "fraud", "class")
ID_NAMES = ("session_id", "conversation_id", "conv_id", "conversationid")
CATEGORY_NAME_PARTS = ("category", "umbrella", "case_type", "scenario", "fraud_type")


def abbreviate(value, limit=160):
    if isinstance(value, str):
        text = " ".join(value.split())
        if len(text) > limit:
            return text[:limit] + "…"
        return text
    if isinstance(value, list):
        shown = [abbreviate(item, limit) for item in value[:2]]
        return {"type": "list", "length": len(value), "first_items": shown}
    if isinstance(value, dict):
        return {key: abbreviate(item, limit) for key, item in value.items()}
    return value


def feature_names(features):
    return list(features.keys()) if features is not None else []


def looks_like_label(name):
    lowered = name.lower()
    return any(part in lowered for part in LABEL_NAME_PARTS)


def looks_like_category(name):
    lowered = name.lower()
    return any(part in lowered for part in CATEGORY_NAME_PARTS)


def column_counts(split_data, column):
    values = split_data[column]
    counts = {}
    for value in values:
        key = value if isinstance(value, (str, int, float, bool)) or value is None else str(type(value).__name__)
        counts[key] = counts.get(key, 0) + 1
    return dict(sorted(counts.items(), key=lambda item: (-item[1], str(item[0]))))


def describe_split(name, split_data):
    columns = feature_names(split_data.features)
    lowered = {column.lower(): column for column in columns}
    print(f"\n=== split: {name} ===")
    print(f"rows: {len(split_data)}")
    print("columns:")
    for column in columns:
        print(f"  - {column}: {split_data.features[column]}")

    flags = {
        "cumulative_transcript": "cumulative_transcript" in lowered,
        "chunk_timestamp": "chunk_timestamp" in lowered,
        "session_id": "session_id" in lowered,
        "conversation_id": any(candidate in lowered for candidate in ID_NAMES),
        "fraud_category_column": any(looks_like_category(column) for column in columns),
    }
    print("field checks:")
    for key, present in flags.items():
        print(f"  {key}: {present}")

    label_columns = [column for column in columns if looks_like_label(column)]
    if label_columns:
        print("label distributions:")
        for column in label_columns:
            print(f"  {column}: {json.dumps(column_counts(split_data, column), ensure_ascii=False)}")
    else:
        print("label distributions: no verdict/label/fraud/class column in this split")

    category_columns = [column for column in columns if looks_like_category(column)]
    if category_columns:
        print("category-like columns:")
        for column in category_columns:
            print(f"  {column}")

    row = split_data[0]
    print("first row, abbreviated:")
    print(json.dumps(abbreviate(row), indent=2, ensure_ascii=False, default=str))
    return columns, flags


def main():
    print(f"dataset: {DATASET_ID}")
    try:
        configs = get_dataset_config_names(DATASET_ID)
    except Exception as error:
        print("Could not read dataset configurations.")
        print(type(error).__name__ + ":", error)
        print("Stopped before downloading. If this is an access or configuration error, resolve it before retrying.")
        return 1

    print("configurations:", ", ".join(configs) if configs else "(none)")
    if len(configs) > 1:
        print("This dataset has more than one configuration.")
        print("Choose one before loading. Nothing was downloaded and no split was created.")
        return 2

    try:
        dataset = load_dataset(DATASET_ID)
    except Exception as error:
        print("Could not load the dataset.")
        print(type(error).__name__ + ":", error)
        print("Stopped. If Hugging Face asked for login, approval, or a config name, that requirement is above.")
        return 1

    if not hasattr(dataset, "keys"):
        print("Loaded object has no splits:", type(dataset).__name__)
        return 1

    print("splits:", ", ".join(dataset.keys()))
    all_columns = {}
    all_flags = {}
    for split_name in dataset.keys():
        columns, flags = describe_split(split_name, dataset[split_name])
        all_columns[split_name] = columns
        all_flags[split_name] = flags

    print("\n=== representation ===")
    for split_name, columns in all_columns.items():
        lowered = {column.lower() for column in columns}
        has_chunks = "cumulative_transcript" in lowered or "chunk_timestamp" in lowered
        has_full = "transcript" in lowered and "cumulative_transcript" not in lowered
        if has_chunks and "transcript" in lowered:
            kind = "both full-conversation fields and streaming-chunk fields"
        elif has_chunks:
            kind = "streaming chunks"
        elif has_full:
            kind = "full conversations"
        else:
            kind = "unrecognized row shape"
        print(f"{split_name}: {kind}")

    expected = ["train", "validation", "test", "cross_domain"]
    print("\nexpected split presence:")
    for name in expected:
        print(f"  {name}: {name in dataset}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
