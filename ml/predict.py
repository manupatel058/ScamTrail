"""Load the saved ScamTrail fraud pipeline and score conversation text.

The two conversations in main() are sanity checks. They are not evaluation
metrics and they are not part of the ICFD-31k splits.
"""

import sys
from pathlib import Path

import joblib

MODEL_PATH = Path(__file__).resolve().parent / "models" / "scamtrail_tfidf_logreg.joblib"

NORMAL_CONVERSATION = (
    "Agent: Hello, this is Neha from the public library. The book you reserved "
    "last week is ready for pickup. "
    "Customer: Thank you. How late are you open today? "
    "Agent: The desk is open until 6 pm. Please bring your library card. "
    "Customer: I will stop by this afternoon."
)

SUSPICIOUS_CONVERSATION = (
    "Agent: This is Rajiv from the bank fraud department. I am calling because "
    "your account will be blocked in the next ten minutes after a suspicious "
    "transfer. "
    "Customer: Can you stop that? "
    "Agent: Yes, but only if you read me the verification code we just sent to "
    "your phone. Do it now or the bank will freeze the account."
)


def load_model():
    if not MODEL_PATH.is_file():
        raise FileNotFoundError(f"Saved model was not found at {MODEL_PATH}")
    return joblib.load(MODEL_PATH)


def predict_fraud_probability(text):
    """Return the positive-class (fraud) probability for conversation text."""
    model = load_model()
    classes = list(model.named_steps["clf"].classes_)
    positive_index = classes.index(1)
    probability = model.predict_proba([text])[0, positive_index]
    return float(probability)


def main():
    normal = predict_fraud_probability(NORMAL_CONVERSATION)
    suspicious = predict_fraud_probability(SUSPICIOUS_CONVERSATION)
    print("Sanity checks only. These two hand-written conversations are not evaluation metrics.")
    print(f"normal conversation probability: {normal:.4f}")
    print(f"suspicious conversation probability: {suspicious:.4f}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
