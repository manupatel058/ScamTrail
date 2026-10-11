"""Explain TF-IDF coefficient signs using the official ICFD-31k train split.

Reads the saved pipeline and the train split. Does not train, and does not
modify the model or the application.
"""

import sys
from collections import Counter, defaultdict
from pathlib import Path

import joblib
from datasets import load_dataset

MODEL_PATH = Path(__file__).resolve().parent / "models" / "scamtrail_tfidf_logreg.joblib"
DATASET_ID = "rishia2220/icfd-31k"

TERMS = [
    "fraud",
    "bank fraud",
    "fraud department",
    "verification code",
    "gift card",
    "wire transfer",
    "password",
    "immediately",
    "suspended",
    "confirm",
    "confirm your",
    "install",
    "otp",
    "one-time code",
    "payment",
    "fee",
    "account",
    "urgent",
    "do not hang up",
    "don't hang up",
]

FRAUD_CASE_TYPES = {"Clear Fraud", "Subtle Fraud"}
NORMAL_CASE_TYPES = {"Clear Normal", "Ambiguous but Ultimately Normal"}


def contains_term(text, term):
    start = 0
    while True:
        index = text.find(term, start)
        if index < 0:
            return False
        before_ok = index == 0 or not text[index - 1].isalnum()
        end = index + len(term)
        after_ok = end == len(text) or not text[end].isalnum()
        if before_ok and after_ok:
            return True
        start = index + 1


def snippet(text, needle):
    lowered = text.lower().replace("\n", " ")
    index = lowered.find(needle)
    if index < 0:
        return ""
    return lowered[max(0, index - 70) : index + len(needle) + 70]


def feature_rows(vectorizer, coefficients, term):
    vocabulary = vectorizer.vocabulary_
    key = term.lower()
    if key in vocabulary:
        weight = float(coefficients[vocabulary[key]])
        return [{"feature": key, "coefficient": weight, "exact": True}]
    rows = []
    for token in vectorizer.build_analyzer()(term):
        if token in vocabulary and token != key:
            rows.append(
                {
                    "feature": token,
                    "coefficient": float(coefficients[vocabulary[token]]),
                    "exact": False,
                }
            )
    return rows


def percent(count, total):
    if total == 0:
        return 0.0
    return 100.0 * count / total


def main():
    model = joblib.load(MODEL_PATH)
    vectorizer = model.named_steps["tfidf"]
    classifier = model.named_steps["clf"]
    coefficients = classifier.coef_[0]
    vocabulary = vectorizer.vocabulary_
    analyzer = vectorizer.build_analyzer()
    features = [feature_rows(vectorizer, coefficients, term) for term in TERMS]
    exact_feature = [term.lower() in vocabulary for term in TERMS]
    onset_lexicon = {
        TERMS.index(name)
        for name in ("password", "immediately", "suspended", "confirm", "install", "urgent")
    }

    print(f"dataset: {DATASET_ID} train")
    print(f"model: {MODEL_PATH.name}")
    print(f"intercept: {float(classifier.intercept_[0]):+.4f}")
    print("A positive coefficient raises the log-odds of final_verdict YES.")
    print("Counts for vocabulary features use the saved TF-IDF analyzer.")
    print("The token pattern drops apostrophes, so bank's fraud is the feature bank fraud.")
    print("Chunk text is cumulative, so a word said early remains in later chunks.")
    print()

    train = load_dataset(DATASET_ID)["train"]
    uids = train["conversation_uid"]
    texts = train["cumulative_text"]
    verdicts = train["final_verdict"]
    timestamps = train["chunk_timestamp"]
    case_types = train["case_type"]

    grouped = defaultdict(list)
    case_chunks = Counter()
    case_conversations = defaultdict(set)
    mixed_case = 0
    yes_chunks = 0
    no_chunks = 0

    term_yes_chunks = [0] * len(TERMS)
    term_no_chunks = [0] * len(TERMS)
    literal_hits = [0] * len(TERMS)
    yes_with_onset = [0] * len(TERMS)
    no_with_onset = [0] * len(TERMS)
    examples = defaultdict(list)
    variants = {
        "bank's fraud": 0,
        "gift cards": 0,
        "one-time": 0,
        "one-time code": 0,
        "wire transfer": 0,
    }

    for uid, text, verdict, timestamp, case_type in zip(
        uids, texts, verdicts, timestamps, case_types
    ):
        lowered = text.lower()
        for variant in variants:
            if contains_term(lowered, variant):
                variants[variant] += 1
        tokens = set(analyzer(text))
        mask = 0
        is_yes = verdict == "YES"
        if is_yes:
            yes_chunks += 1
        elif verdict == "NO":
            no_chunks += 1
        else:
            raise SystemExit(f"Unexpected verdict: {verdict}")
        for index, term in enumerate(TERMS):
            key = term.lower()
            literal = contains_term(lowered, key)
            if literal:
                literal_hits[index] += 1
            present = key in tokens if exact_feature[index] else literal
            if not present:
                continue
            mask |= 1 << index
            if len(examples[index]) < 3 and uid not in {item[0] for item in examples[index]}:
                needle = key if literal else "fraud"
                examples[index].append((uid, case_type, verdict, snippet(text, needle)))
            if is_yes:
                term_yes_chunks[index] += 1
            else:
                term_no_chunks[index] += 1
        has_onset_lexicon = any(mask & (1 << bit) for bit in onset_lexicon)
        if has_onset_lexicon:
            for index in range(len(TERMS)):
                if mask & (1 << index) == 0:
                    continue
                if is_yes:
                    yes_with_onset[index] += 1
                else:
                    no_with_onset[index] += 1
        case_chunks[case_type] += 1
        case_conversations[case_type].add(uid)
        grouped[uid].append((int(timestamp), is_yes, mask, case_type))

    before_conversations = [0] * len(TERMS)
    after_conversations = [0] * len(TERMS)
    first_at_onset = [0] * len(TERMS)
    carried_into_onset = [0] * len(TERMS)
    clear_normal_conversations = [0] * len(TERMS)
    ambiguous_conversations = [0] * len(TERMS)
    no_hits_normal = [0] * len(TERMS)
    no_hits_pre_onset = [0] * len(TERMS)
    yes_hits_carryover = [0] * len(TERMS)
    yes_hits_new = [0] * len(TERMS)
    fraud_without_onset = 0
    fraud_conversations = 0
    regressions = 0

    for chunks in grouped.values():
        chunks.sort()
        cases = {case_type for _, _, _, case_type in chunks}
        if len(cases) > 1:
            mixed_case += 1
        case_type = chunks[0][3]
        onset = next((timestamp for timestamp, is_yes, _, _ in chunks if is_yes), None)
        is_fraud = case_type in FRAUD_CASE_TYPES
        if is_fraud:
            fraud_conversations += 1
            if onset is None:
                fraud_without_onset += 1
        saw_yes = False
        for timestamp, is_yes, _, _ in chunks:
            if saw_yes and not is_yes:
                regressions += 1
                break
            if is_yes:
                saw_yes = True

        seen_before = 0
        conversation_before = 0
        conversation_after = 0
        for timestamp, is_yes, mask, _ in chunks:
            if mask == 0:
                continue
            pre_onset = is_fraud and onset is not None and timestamp < onset
            on_or_after = is_fraud and onset is not None and timestamp >= onset
            for index in range(len(TERMS)):
                bit = 1 << index
                if mask & bit == 0:
                    continue
                if case_type in NORMAL_CASE_TYPES and not is_yes:
                    no_hits_normal[index] += 1
                elif pre_onset:
                    no_hits_pre_onset[index] += 1
                    conversation_before |= bit
                    seen_before |= bit
                elif on_or_after:
                    conversation_after |= bit
                    if seen_before & bit:
                        yes_hits_carryover[index] += 1
                    else:
                        yes_hits_new[index] += 1
        for index in range(len(TERMS)):
            bit = 1 << index
            if conversation_before & bit:
                before_conversations[index] += 1
            if conversation_after & bit:
                after_conversations[index] += 1
            if (conversation_after & bit) and not (conversation_before & bit):
                first_at_onset[index] += 1
            if (conversation_before & bit) and (conversation_after & bit):
                carried_into_onset[index] += 1

    clear_normal_conversations = [0] * len(TERMS)
    ambiguous_conversations = [0] * len(TERMS)
    for chunks in grouped.values():
        case_type = chunks[0][3]
        if case_type not in NORMAL_CASE_TYPES:
            continue
        seen = 0
        for _, _, mask, _ in chunks:
            seen |= mask
        for index in range(len(TERMS)):
            if seen & (1 << index):
                if case_type == "Clear Normal":
                    clear_normal_conversations[index] += 1
                else:
                    ambiguous_conversations[index] += 1

    print(f"train chunks: {len(uids):,}")
    print(f"train conversations: {len(grouped):,}")
    print(f"YES chunks: {yes_chunks:,}")
    print(f"NO chunks: {no_chunks:,}")
    print(f"YES base rate: {percent(yes_chunks, len(uids)):.2f}%")
    print(f"fraud-typed conversations with no YES chunk: {fraud_without_onset:,}")
    print(f"conversations with a YES then a later NO: {regressions:,}")
    print(f"conversations with more than one case type: {mixed_case:,}")
    print()
    print("=== case types ===")
    for name in (
        "Clear Fraud",
        "Subtle Fraud",
        "Clear Normal",
        "Ambiguous but Ultimately Normal",
    ):
        print(
            f"{name}: {len(case_conversations[name]):,} conversations, "
            f"{case_chunks[name]:,} chunks"
        )
    print()

    print("=== phrase statistics ===")
    for index, term in enumerate(TERMS):
        rows = features[index]
        exact = [row for row in rows if row["exact"]]
        print(f"\n[{term}]")
        if exact:
            print(f"coefficient: {exact[0]['coefficient']:+.4f}")
        elif rows:
            print("coefficient: not one vocabulary feature. Component features:")
            for row in rows:
                print(f"  {row['feature']}: {row['coefficient']:+.4f}")
        else:
            print("coefficient: absent from the TF-IDF vocabulary")
        if exact_feature[index] and literal_hits[index] != term_yes_chunks[index] + term_no_chunks[index]:
            print(
                f"literal phrase chunks: {literal_hits[index]:,}; "
                f"analyzer feature chunks: {term_yes_chunks[index] + term_no_chunks[index]:,}"
            )
        print(f"YES chunks containing it: {term_yes_chunks[index]:,} ({percent(term_yes_chunks[index], yes_chunks):.4f}% of YES)")
        print(f"NO chunks containing it: {term_no_chunks[index]:,} ({percent(term_no_chunks[index], no_chunks):.4f}% of NO)")
        print(
            f"of those, chunks that also contain password/immediately/suspended/confirm/install/urgent: "
            f"YES {yes_with_onset[index]:,}, NO {no_with_onset[index]:,}"
        )
        hits = term_yes_chunks[index] + term_no_chunks[index]
        print(f"P(YES | chunk contains it): {percent(term_yes_chunks[index], hits):.2f}%")
        print(f"fraud conversations containing it before onset: {before_conversations[index]:,}")
        print(f"fraud conversations containing it on or after onset: {after_conversations[index]:,}")
        print(f"  first appears on or after onset: {first_at_onset[index]:,}")
        print(f"  already present before onset and carried forward: {carried_into_onset[index]:,}")
        normal_conversations = clear_normal_conversations[index] + ambiguous_conversations[index]
        print(f"normal training conversations containing it: {normal_conversations:,}")
        print(f"Clear Normal conversations containing it: {clear_normal_conversations[index]:,}")
        print(f"Ambiguous but Ultimately Normal conversations containing it: {ambiguous_conversations[index]:,}")
        print(f"NO chunks from non-fraud conversations: {no_hits_normal[index]:,}")
        print(f"NO chunks from fraud conversations before onset: {no_hits_pre_onset[index]:,}")
        print(f"YES chunks where the phrase was already present before onset: {yes_hits_carryover[index]:,}")
        print(f"YES chunks where the phrase first appears on or after onset: {yes_hits_new[index]:,}")

    print("\n=== surface variants that are not the vocabulary key ===")
    for name, count in variants.items():
        print(f"{name}: {count:,} chunks")

    print("\n=== example windows ===")
    for index, term in enumerate(TERMS):
        if term not in {"fraud", "bank fraud", "verification code", "immediately", "suspended"}:
            continue
        for uid, case_type, verdict, text in examples[index]:
            print(f"[{term}] {case_type} / {verdict} / {uid}: {text}")

    return 0


if __name__ == "__main__":
    sys.exit(main())
