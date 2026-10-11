"""Score conversation text with the saved ScamTrail model.

Reads one JSON object per line from stdin: {"text": "..."}
Writes one JSON object per line to stdout. This process does not train.
"""

import json
import sys
import warnings
from pathlib import Path

import joblib

warnings.filterwarnings("ignore")

MODEL_PATH = Path(__file__).resolve().parent / "models" / "scamtrail_v2.joblib"


def load_trained_model():
    if not MODEL_PATH.is_file():
        raise FileNotFoundError(f"Saved model was not found at {MODEL_PATH}")
    model = joblib.load(MODEL_PATH)
    print(f"Loaded trained model: {MODEL_PATH}", file=sys.stderr, flush=True)
    return model


MODEL = load_trained_model()
POSITIVE = list(MODEL.named_steps["clf"].classes_).index(1)


def score(text):
    probability = float(MODEL.predict_proba([text])[0, POSITIVE])
    risk_score = max(0, min(100, int(round(probability * 100))))
    return {
        "riskScore": risk_score,
        "fraudProbability": probability,
        "source": "scamtrail-trained-model",
    }


def main():
    for line in sys.stdin:
        if not line.strip():
            continue
        try:
            payload = json.loads(line)
            text = payload.get("text", "")
            if not isinstance(text, str) or not text.strip():
                result = {"error": "Text is required."}
            else:
                result = score(text)
        except Exception as error:
            print(f"risk worker failed: {error.__class__.__name__}", file=sys.stderr, flush=True)
            result = {"error": "The trained model could not score this text."}
        sys.stdout.write(json.dumps(result) + "\n")
        sys.stdout.flush()


if __name__ == "__main__":
    main()
