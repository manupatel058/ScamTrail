"""Informal out-of-distribution stress test for the saved ScamTrail classifier.

Scores 30 original conversations turn by turn. This is not the official
ICFD-31k evaluation, and it does not train or modify the saved pipeline.
"""

import sys
from pathlib import Path

import joblib
import numpy as np
from sklearn.metrics import confusion_matrix, f1_score, precision_score, recall_score

MODEL_PATH = Path(__file__).resolve().parent / "models" / "scamtrail_tfidf_logreg.joblib"
THRESHOLD = 0.50

LOW_SANITY = (
    "Agent: This is Rajiv from the bank fraud department. I am calling because "
    "your account will be blocked in the next ten minutes after a suspicious "
    "transfer. "
    "Customer: Can you stop that? "
    "Agent: Yes, but only if you read me the verification code we just sent to "
    "your phone. Do it now or the bank will freeze the account."
)
HIGH_API = (
    "Speech: Hello, this is the bank. Your account will be suspended immediately "
    "unless you confirm your password."
)

CONVERSATIONS = [
    {
        "id": "obvious-bank",
        "kind": "obvious",
        "expected": "SCAM",
        "turns": [
            "Alex: Hello, this is Alex at First National's fraud desk.",
            "You: I didn't call the bank.",
            "Alex: A transfer of four thousand dollars just left your checking account. I can reverse it if you stay with me.",
            "You: What do I need to do?",
            "Alex: Read me the six-digit text that just arrived, then move the rest into the safe account I give you.",
        ],
    },
    {
        "id": "obvious-tech",
        "kind": "obvious",
        "expected": "SCAM",
        "turns": [
            "Sam: This is Sam from Microsoft support. Someone is controlling your computer.",
            "You: I'm just browsing.",
            "Sam: Download the remote tool I texted you and tell me the access code on the screen.",
            "You: Is that safe?",
            "Sam: If you wait, your files will be locked. Buy two gift cards and read me the numbers so we can trace the attacker.",
        ],
    },
    {
        "id": "obvious-tax",
        "kind": "obvious",
        "expected": "SCAM",
        "turns": [
            "Hale: This is Officer Hale with the state tax division. A warrant is being prepared over an unpaid balance.",
            "You: I filed my taxes.",
            "Hale: The warrant goes to the police this afternoon unless you pay with gift cards while I stay on the line.",
            "You: Can I call the agency back?",
            "Hale: No. Do not hang up and do not speak to anyone else until the payment clears.",
        ],
    },
    {
        "id": "obvious-job",
        "kind": "obvious",
        "expected": "SCAM",
        "turns": [
            "Recruiter: Congratulations, you are hired for the remote assistant role.",
            "You: I haven't interviewed.",
            "Recruiter: Training starts today. Buy a laptop from our partner and we reimburse you after you send the receipt.",
            "You: How much?",
            "Recruiter: Send eight hundred dollars to this account now or the offer expires tonight.",
        ],
    },
    {
        "id": "obvious-market",
        "kind": "obvious",
        "expected": "SCAM",
        "turns": [
            "Buyer: I'll take the couch. I can't use the app checkout.",
            "You: The listing says to pay in the app.",
            "Buyer: My cousin will pick it up. Send me your login so I can release the payment, or wire a holding fee.",
            "You: That seems backwards.",
            "Buyer: If you don't pay the holding fee in the next hour, I'm reporting you and buying from someone else.",
        ],
    },
    {
        "id": "obvious-family",
        "kind": "obvious",
        "expected": "SCAM",
        "turns": [
            "Caller: Grandma, it's Danny. I'm in jail and they took my phone.",
            "You: You don't sound like Danny.",
            "Caller: I have a broken nose. Don't tell Mom. The bail office needs two thousand wired right now.",
            "You: I should call your mother.",
            "Caller: If you tell anyone they will keep me here. Go to the store and read the transfer number to me.",
        ],
    },
    {
        "id": "obvious-utility",
        "kind": "obvious",
        "expected": "SCAM",
        "turns": [
            "Agent: City power. Your electricity shuts off at noon because of an overdue bill.",
            "You: I paid last week.",
            "Agent: The payment did not post. I can take your card number on this call and stop the shutoff.",
            "You: I'll pay on the website.",
            "Agent: The website is down. Give me the card and the three digits on the back or the crew is already on the way.",
        ],
    },
    {
        "id": "obvious-prize",
        "kind": "obvious",
        "expected": "SCAM",
        "turns": [
            "Host: You were selected as this week's cash winner. Ten thousand dollars is waiting.",
            "You: I didn't enter anything.",
            "Host: You are still eligible. Pay the release tax with prepaid cards and the money is yours today.",
            "You: What tax?",
            "Host: Read the card numbers to me before the claim window closes.",
        ],
    },
    {
        "id": "obvious-account",
        "kind": "obvious",
        "expected": "SCAM",
        "turns": [
            "Security: Someone in another country is inside your email and moving money.",
            "You: What should I do?",
            "Security: Do not log in yourself. Tell me the current password and the code we just texted so I can kick them out.",
            "You: I can change it myself.",
            "Security: If you change it, the thief keeps the session. Read both to me now.",
        ],
    },
    {
        "id": "obvious-loan",
        "kind": "obvious",
        "expected": "SCAM",
        "turns": [
            "Lender: Your personal loan is pre-approved for fifteen thousand.",
            "You: I didn't apply.",
            "Lender: A partner submitted it. To release the funds, pay a four hundred dollar processing charge from a different account.",
            "You: Why up front?",
            "Lender: Send it to this routing number in the next thirty minutes or the approval is cancelled.",
        ],
    },
    {
        "id": "subtle-bank",
        "kind": "subtle",
        "expected": "SCAM",
        "turns": [
            "Maya: Hi, this is Maya at Harbor Credit Union, calling about a charge you may not recognize.",
            "You: Which charge?",
            "Maya: A store in another state. I can reverse it if you confirm the short code that just popped up on your phone.",
            "You: I usually check the app.",
            "Maya: The app will show the charge as completed if we wait. Stay with me and read those digits so I can put the money back.",
        ],
    },
    {
        "id": "subtle-tech",
        "kind": "subtle",
        "expected": "SCAM",
        "turns": [
            "Lee: Lee from your internet provider. Your router is broadcasting an open connection.",
            "You: The wifi works fine.",
            "Lee: I can close it from here. Install the small helper from the link I sent and tell me the number it displays.",
            "You: Can I do that on my account page?",
            "Lee: The page won't show this device. The helper is the only way I can see it before someone else uses the connection.",
        ],
    },
    {
        "id": "subtle-tax",
        "kind": "subtle",
        "expected": "SCAM",
        "turns": [
            "Dana: Dana from the revenue office. A line on your return doesn't match the employer's form.",
            "You: I can send an amended return.",
            "Dana: We already opened a review. Remain on this call. I'll tell you which payment channel clears it today.",
            "You: I'd like the letter they usually mail.",
            "Dana: The letter would arrive after the review fee posts. I can take a card now and note that you cooperated.",
        ],
    },
    {
        "id": "subtle-job",
        "kind": "subtle",
        "expected": "SCAM",
        "turns": [
            "Priya: Priya at Northwind Staffing. The client wants you to start Monday.",
            "You: I thought there was another interview.",
            "Priya: They skipped it. Order the headset from the supplier I name and submit the receipt for reimbursement on day one.",
            "You: Can the company ship it?",
            "Priya: Their purchasing system is closed this week. Pay the supplier directly and the stipend covers it on your first check.",
        ],
    },
    {
        "id": "subtle-market",
        "kind": "subtle",
        "expected": "SCAM",
        "turns": [
            "Jordan: Jordan here about the bicycle. I can collect it tonight.",
            "You: Payment through the marketplace, then pickup.",
            "Jordan: I'm between banks. My brother will bring cash, but send a refundable hold to his account so he knows you're serious.",
            "You: The app already has a hold.",
            "Jordan: His account won't see that. A separate transfer lets him leave work on time.",
        ],
    },
    {
        "id": "subtle-family",
        "kind": "subtle",
        "expected": "SCAM",
        "turns": [
            "Chris: Hey, it's Chris. I dropped my phone in a sink, so I'm on a coworker's line.",
            "You: Are you okay?",
            "Chris: Mostly. Rent is due before five and my banking app won't open. Can you send the amount I usually transfer?",
            "You: I can wait until tonight.",
            "Chris: The landlord already warned me. Please use the account number I'm texting from this phone.",
        ],
    },
    {
        "id": "subtle-utility",
        "kind": "subtle",
        "expected": "SCAM",
        "turns": [
            "Noel: Noel with the water department. A meter reading shows a balance that will interrupt service tomorrow morning.",
            "You: I don't see a bill.",
            "Noel: It was generated after the last cycle. I can post a payment if you read the long number across the front of your card.",
            "You: I'll drop a check at the office.",
            "Noel: The office won't apply it before the morning route. The card payment is the one that posts while we are talking.",
        ],
    },
    {
        "id": "subtle-prize",
        "kind": "subtle",
        "expected": "SCAM",
        "turns": [
            "Rae: Rae from the grocery rewards desk. Your points converted into a gift that has to ship this week.",
            "You: I didn't redeem anything.",
            "Rae: The system redeemed them automatically. We only need a small delivery charge so the warehouse can release it.",
            "You: Take it from the points.",
            "Rae: Points don't cover courier fees. I can take a card, or you can buy a money order and tell me the tracking line.",
        ],
    },
    {
        "id": "subtle-account",
        "kind": "subtle",
        "expected": "SCAM",
        "turns": [
            "Quinn: Quinn in account care. A sign-in from a new laptop is waiting for approval.",
            "You: That wasn't me.",
            "Quinn: I can deny it if you read me the message that just arrived, including the numbers.",
            "You: The text says not to share it.",
            "Quinn: That line is for people who weren't already talking to us. Since you are, those numbers let me close the other session.",
        ],
    },
    {
        "id": "subtle-loan",
        "kind": "subtle",
        "expected": "SCAM",
        "turns": [
            "Evan: Evan with Community Lending. A cosigner started an application in your name and the file is ready to fund.",
            "You: I didn't ask for a loan.",
            "Evan: You can decline, but the file stays open and may affect a later application. A small processing amount removes it today.",
            "You: Send the decline form.",
            "Evan: The form takes days. Transfer the fee to the account I'm texting and I'll mark the file withdrawn while we're on the phone.",
        ],
    },
    {
        "id": "normal-bank",
        "kind": "normal",
        "expected": "NORMAL",
        "turns": [
            "Teller: Harbor Credit Union, this is Teller. How can I help?",
            "You: I'd like the balance on my savings.",
            "Teller: I can look that up if you verify the last four digits of the card and your address.",
            "You: The card ends in 4412. The address is 18 Oak Street.",
            "Teller: Savings shows two thousand forty dollars available. Anything else?",
            "You: No, thank you.",
            "Teller: You can also see this in the official app. Have a good day.",
        ],
    },
    {
        "id": "normal-doctor",
        "kind": "normal",
        "expected": "NORMAL",
        "turns": [
            "Clinic: Riverside Clinic. We're calling to move your Thursday appointment.",
            "You: What time is open?",
            "Clinic: Friday at 9:40, or Monday at 2.",
            "You: Friday works.",
            "Clinic: You're set. Bring your insurance card. No payment is needed before the visit.",
            "You: Thanks.",
        ],
    },
    {
        "id": "normal-interview",
        "kind": "normal",
        "expected": "NORMAL",
        "turns": [
            "Morgan: This is Morgan at Northwind. We'd like to schedule a second conversation about the analyst role.",
            "You: I'm interested.",
            "Morgan: Thursday at 11 or Friday at 3. It will be a video call on the company account.",
            "You: Thursday.",
            "Morgan: I'll send the link from a northwind.com address. We will not ask you to buy equipment.",
            "You: Sounds good.",
        ],
    },
    {
        "id": "normal-utility",
        "kind": "normal",
        "expected": "NORMAL",
        "turns": [
            "Utility: City Water. This is a reminder that the March bill is due on the 20th.",
            "You: How much is it?",
            "Utility: Forty-six dollars. You can pay on the city website or by mail.",
            "You: I'll pay online tonight.",
            "Utility: Please use the site printed on the bill. We don't take card numbers by phone.",
            "You: Understood.",
        ],
    },
    {
        "id": "normal-purchase",
        "kind": "normal",
        "expected": "NORMAL",
        "turns": [
            "Shop: Your order for the lamp has shipped.",
            "You: When does it arrive?",
            "Shop: The carrier shows Thursday. You can follow it from the confirmation email.",
            "You: Can I change the address?",
            "Shop: Not after it leaves the warehouse. If it arrives damaged, start a return in your account and the refund goes to the original card.",
            "You: Okay.",
        ],
    },
    {
        "id": "normal-friend",
        "kind": "normal",
        "expected": "NORMAL",
        "turns": [
            "Sam: Hey, do you still have that sixty dollars from the concert tickets?",
            "You: Yes, I forgot.",
            "Sam: No rush this week, but I could use it before Friday if that's easy.",
            "You: I can send it tonight.",
            "Sam: Whatever account you already use is fine. Thanks for remembering.",
            "You: Sent.",
        ],
    },
    {
        "id": "normal-reset",
        "kind": "normal",
        "expected": "NORMAL",
        "turns": [
            "Notice: Your email provider says a password reset was requested.",
            "You: I did request that.",
            "Notice: The message includes a code and says not to share it with anyone who calls you.",
            "You: I'll type it on the site myself.",
            "Notice: If you didn't request it, ignore the message and sign in through the official app.",
            "You: I requested it, so I'll finish on the website.",
        ],
    },
    {
        "id": "normal-university",
        "kind": "normal",
        "expected": "NORMAL",
        "turns": [
            "Advisor: This is the advising office. Your registration window opens Monday.",
            "You: Which courses still have seats?",
            "Advisor: Statistics 201 and Writing 150. I can hold a seat until tomorrow.",
            "You: Please hold Statistics.",
            "Advisor: Done. You'll confirm it in the student portal. There is no fee to hold the seat.",
            "You: Thank you.",
        ],
    },
    {
        "id": "normal-delivery",
        "kind": "normal",
        "expected": "NORMAL",
        "turns": [
            "Driver: I have a package for this address, but the gate code isn't working.",
            "You: The code is 1948.",
            "Driver: I'm at the front door now. No signature is required.",
            "You: You can leave it on the porch.",
            "Driver: Left beside the mat. Have a good afternoon.",
            "You: Thanks.",
        ],
    },
    {
        "id": "normal-support",
        "kind": "normal",
        "expected": "NORMAL",
        "turns": [
            "Support: Customer care for the headphones you bought last month.",
            "You: The left side cuts out.",
            "Support: I can replace them. I'll email a prepaid label from the company domain.",
            "You: Do I pay shipping?",
            "Support: No. After we receive the pair, the replacement ships to the address on the order. Keep the return inside the app.",
            "You: I'll send them tomorrow.",
        ],
    },
]


def probability(model, text):
    classifier = model.named_steps["clf"]
    positive = list(classifier.classes_).index(1)
    return float(model.predict_proba([text])[0, positive])


def contribution_map(model, text):
    vectorizer = model.named_steps["tfidf"]
    classifier = model.named_steps["clf"]
    names = vectorizer.get_feature_names_out()
    coefficients = classifier.coef_[0]
    row = vectorizer.transform([text]).tocsr()
    values = {}
    for index, weight in zip(row.indices, row.data):
        values[names[index]] = float(weight * coefficients[index])
    return values


def ranked_contributions(model, text, limit=8):
    pairs = sorted(contribution_map(model, text).items(), key=lambda item: item[1])
    negative = pairs[:limit]
    positive = list(reversed(pairs[-limit:]))
    intercept = float(model.named_steps["clf"].intercept_[0])
    decision = float(model.decision_function([text])[0])
    return negative, positive, intercept, decision


def largest_shifts(previous, current, limit=5):
    keys = set(previous) | set(current)
    shifts = []
    for key in keys:
        delta = current.get(key, 0.0) - previous.get(key, 0.0)
        if abs(delta) >= 0.05:
            shifts.append((delta, key))
    shifts.sort()
    return shifts[:limit], list(reversed(shifts[-limit:]))


def cumulative(turns, count):
    return "\n".join(turns[:count])


def main():
    if len(CONVERSATIONS) != 30:
        raise SystemExit(f"Expected 30 conversations, found {len(CONVERSATIONS)}")
    model = joblib.load(MODEL_PATH)
    print("Informal out-of-distribution stress test.")
    print("These numbers are not official ICFD-31k evaluation metrics.")
    print(f"model: {MODEL_PATH.name}")
    print(f"threshold: {THRESHOLD:.2f} on the final turn, unless a line says otherwise")
    print()

    rows = []
    jumps = []
    for conversation in CONVERSATIONS:
        turns = conversation["turns"]
        scores = []
        previous_map = {}
        previous_score = None
        print(f"=== {conversation['id']} ({conversation['kind']}) ===")
        print(f"Expected: {conversation['expected']}")
        for index, _turn in enumerate(turns, start=1):
            text = cumulative(turns, index)
            score = probability(model, text)
            scores.append(score)
            print(f"Turn {index}: {score:.4f}")
            current_map = contribution_map(model, text)
            if previous_score is not None:
                delta = score - previous_score
                if abs(delta) >= 0.15:
                    down, up = largest_shifts(previous_map, current_map)
                    jumps.append(
                        {
                            "id": conversation["id"],
                            "turn": index,
                            "delta": delta,
                            "up": up,
                            "down": down,
                            "line": turns[index - 1],
                        }
                    )
            previous_map = current_map
            previous_score = score
        final = scores[-1]
        highest = max(scores)
        print(f"Final probability: {final:.4f}")
        print(f"Highest probability: {highest:.4f}")
        print()
        rows.append(
            {
                **conversation,
                "scores": scores,
                "final": final,
                "highest": highest,
            }
        )

    y_true = [1 if row["expected"] == "SCAM" else 0 for row in rows]
    y_final = [1 if row["final"] >= THRESHOLD else 0 for row in rows]
    y_stream = [1 if row["highest"] >= THRESHOLD else 0 for row in rows]

    def report(title, predicted):
        matrix = confusion_matrix(y_true, predicted, labels=[0, 1])
        print(f"=== {title} ===")
        print(
            "confusion matrix rows true NORMAL/SCAM, columns predicted below/at-or-above 0.50:"
        )
        print(f"  [[{matrix[0][0]}, {matrix[0][1]}],")
        print(f"   [{matrix[1][0]}, {matrix[1][1]}]]")
        print(f"precision: {precision_score(y_true, predicted, zero_division=0):.4f}")
        print(f"recall:    {recall_score(y_true, predicted, zero_division=0):.4f}")
        print(f"f1:        {f1_score(y_true, predicted, zero_division=0):.4f}")
        scams = [row for row in rows if row["expected"] == "SCAM"]
        normals = [row for row in rows if row["expected"] == "NORMAL"]
        detected = [row["id"] for row, label in zip(rows, predicted) if row["expected"] == "SCAM" and label == 1]
        missed = [row["id"] for row, label in zip(rows, predicted) if row["expected"] == "SCAM" and label == 0]
        calm = [row["id"] for row, label in zip(rows, predicted) if row["expected"] == "NORMAL" and label == 0]
        alarms = [row["id"] for row, label in zip(rows, predicted) if row["expected"] == "NORMAL" and label == 1]
        print(f"SCAM correctly detected: {len(detected)} / {len(scams)}")
        print(f"SCAM missed: {len(missed)} / {len(scams)}")
        for name in missed:
            print(f"  missed: {name}")
        print(f"NORMAL remained below threshold: {len(calm)} / {len(normals)}")
        print(f"NORMAL false alarms: {len(alarms)} / {len(normals)}")
        for name in alarms:
            print(f"  false alarm: {name}")
        print()

    print("=== final probabilities ===")
    for row in rows:
        print(f"{row['id']}: {row['final']:.4f}  expected {row['expected']}  highest {row['highest']:.4f}")
    print()
    report("final-turn threshold 0.50", y_final)
    report("any-turn threshold 0.50", y_stream)

    print("=== scams that stayed under 0.50 at the end ===")
    for row in rows:
        if row["expected"] == "SCAM" and row["final"] < THRESHOLD:
            path = " ".join(f"{score:.2f}" for score in row["scores"])
            print(f"{row['id']}: final {row['final']:.4f}  path {path}")
    print()
    print("=== normal conversations that reached 0.50 ===")
    for row in rows:
        if row["expected"] == "NORMAL" and row["highest"] >= THRESHOLD:
            path = " ".join(f"{score:.2f}" for score in row["scores"])
            print(f"{row['id']}: highest {row['highest']:.4f}  final {row['final']:.4f}  path {path}")
    print()
    print("=== scam paths that rose into the warning range ===")
    for row in rows:
        if row["expected"] != "SCAM":
            continue
        if row["scores"][-1] >= row["scores"][0] + 0.15 and row["highest"] >= THRESHOLD:
            print(f"{row['id']}: {row['scores'][0]:.4f} -> {row['final']:.4f}")
    print()
    print("=== unusual paths ===")
    for row in rows:
        scores = row["scores"]
        swing = max(scores) - min(scores)
        dropped = scores[-1] < max(scores) - 0.20
        early_spike = row["expected"] == "NORMAL" and scores[0] >= THRESHOLD
        late_drop_scam = row["expected"] == "SCAM" and dropped
        if early_spike or late_drop_scam or (row["expected"] == "SCAM" and swing < 0.05):
            path = " ".join(f"{score:.2f}" for score in scores)
            print(f"{row['id']}: path {path}")
    print()
    print("=== turns with a probability change of at least 0.15 ===")
    for jump in sorted(jumps, key=lambda item: abs(item["delta"]), reverse=True):
        print(
            f"{jump['id']} turn {jump['turn']}: {jump['delta']:+.4f} :: {jump['line']}"
        )
        print("  positive shifts: " + ", ".join(f"{name} {delta:+.3f}" for delta, name in jump["up"]))
        print("  negative shifts: " + ", ".join(f"{name} {delta:+.3f}" for delta, name in jump["down"]))
    print()

    print("=== earlier examples, feature contributions ===")
    for label, text in (
        ("previous suspicious sanity example", LOW_SANITY),
        ("later bank-threat /api/risk example", HIGH_API),
    ):
        score = probability(model, text)
        negative, positive, intercept, decision = ranked_contributions(model, text)
        print(f"{label}")
        print(f"probability: {score:.6f}")
        print(f"decision function: {decision:.4f}")
        print(f"intercept: {intercept:.4f}")
        print("strongest positive contributions:")
        for name, value in positive:
            print(f"  {value:+.4f}  {name}")
        print("strongest negative contributions:")
        for name, value in negative:
            print(f"  {value:+.4f}  {name}")
        print()
    return 0


if __name__ == "__main__":
    sys.exit(main())
