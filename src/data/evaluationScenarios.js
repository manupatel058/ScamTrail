// Development and evaluation data only. Not shown in the app.
// expectedPatterns is not sent to Gemini or the risk engine.

export const evaluationScenarios = [
  {
    id: 'eval-cedar-pine-review',
    name: 'Credit union charge review',
    category: 'financial',
    description:
      'A fictional credit union contact moves from a card-delivery check to a loss, a short dispute window, a request to avoid the branch, and a request for a code and password.',
    conversation: `Cedar & Pine Credit Union: Hi, this is Alex Nguyen. I'm following up on a note in your Cedar & Pine profile about the debit card mailed last week. Did you receive it?

You: I think so. I haven't activated it yet.

Cedar & Pine Credit Union: That's useful to know. A charge of $1,860 was attempted at a hardware store in another state on that card. If it posts, the available balance drops with it.

You: I haven't been to a hardware store.

Cedar & Pine Credit Union: I can dispute it, but the window closes in 15 minutes. After that the charge is treated as recognized.

Cedar & Pine Credit Union: Please stay in this chat. If you call the number on the card or open the app, the dispute timer resets and I can't keep the hold.

You: What do you need from me?

Cedar & Pine Credit Union: Read me the six-digit text I just sent, and the password you use for online banking, so I can reject the charge.`,
    expectedPatterns: ['authority', 'fear_reward', 'urgency', 'isolation', 'sensitive_request'],
  },
  {
    id: 'eval-lumenfield-payroll',
    name: 'Payroll duplicate deposit',
    category: 'financial',
    description:
      'A fictional payroll contact starts with a timesheet note, then warns that both deposits will bounce unless money is transferred before a cutoff.',
    conversation: `Lumenfield Studio Payroll: Hi, this is Jordan from Lumenfield Studio payroll. Your timesheet for last week came through fine.

You: Thanks. Is payday still Friday?

Lumenfield Studio Payroll: There's a duplicate deposit sitting on the account. If it isn't moved to the studio holding account before 3 p.m., the bank reverses both payments and Friday's wages bounce.

You: Can I just wait and see what posts?

Lumenfield Studio Payroll: No. Transfer $640 to the studio safe account now. Use payment handle lumenfield.hold and mark it payroll correction. I need the confirmation before the 3 p.m. file closes.`,
    expectedPatterns: ['authority', 'fear_reward', 'urgency', 'money_action'],
  },
  {
    id: 'eval-brightwater-card',
    name: 'Card services decline',
    category: 'financial',
    description:
      'A fictional card-services contact asks about a small purchase, then adds a capture deadline and a request for a one-time code.',
    conversation: `Brightwater Community Bank: This is Rowan Blake in card services at Brightwater Community Bank. I'm checking a $61 purchase that just tried to post on the card ending in 2204.

You: I don't recognize that store.

Brightwater Community Bank: If we don't decline it in the next few minutes, the merchant can capture the payment and the amount leaves the account.

You: I can look in the app after work.

Brightwater Community Bank: That will be too late for this one. To decline it from my side, tell me the one-time code that was just sent to you.`,
    expectedPatterns: ['authority', 'fear_reward', 'urgency', 'sensitive_request'],
  },
  {
    id: 'eval-lensboard-recovery',
    name: 'Photo app recovery',
    category: 'social',
    description:
      'A fictional photo-app contact starts with an unrecognized sign-in, then adds account loss, a short recovery window, a request to stay in the chat, and a request for a code and password.',
    conversation: `Lensboard: Hi, I'm Quinn Adler with Lensboard. We saw a sign-in on your photo account from a browser we don't recognize. Wanted to check it was you.

You: I don't think so. I only use the phone app.

Lensboard: The other session started an email change. If that finishes, you can lose the account and the albums shared with your family.

You: I'll change the password in the app.

Lensboard: The recovery page is only available for the next 12 minutes. After that the email change is treated as confirmed.

Lensboard: Don't text your family or open a second help chat. That splits the case and the email change goes through.

You: What should I do, then?

Lensboard: Send the 6-digit code on your phone and the password for the account so I can cancel the email change.`,
    expectedPatterns: ['authority', 'fear_reward', 'urgency', 'isolation', 'sensitive_request'],
  },
  {
    id: 'eval-devon-ride',
    name: 'Friend stranded for a ride',
    category: 'social',
    description:
      'Someone claiming to be a friend on a borrowed phone moves from a casual hello to a missed train and a request to pay a driver.',
    conversation: `Devon: hey it's devon. dropped my phone in a puddle and i'm on a borrowed one. this is the only number i remember.

You: Devon? Are you okay?

Devon: I'm stuck outside the train station and my wallet is in the other bag. If I don't get a ride in the next 20 minutes I'll miss the last train home.

You: Can you use a rideshare on that phone?

Devon: The app won't take this number. Can you send $60 to @station.ride so the driver will take me? I'll pay you back as soon as I'm home.`,
    expectedPatterns: ['authority', 'fear_reward', 'urgency', 'money_action'],
  },
  {
    id: 'eval-brand-collab',
    name: 'Brand collab verification',
    category: 'social',
    description:
      'A fictional brand partner starts with a friendly collab note, then asks the recipient to stay quiet and send a login code before a posting slot closes.',
    conversation: `Northwind Studio: Hi, I'm Samira from Northwind Studio partnerships. We liked the last three posts and wanted to talk about a small collab for next month.

You: Oh, nice. What kind of collab?

Northwind Studio: A paid try-on of a new water bottle. Before we can send it, the brand portal has to match the login on the account, and that check closes at 5 today.

You: I can log in myself and send a screenshot.

Northwind Studio: Please don't loop in your manager or open the app settings while I have the portal up. It kicks the match. Reply with the login code I just triggered and I'll attach the collab.`,
    expectedPatterns: ['authority', 'urgency', 'isolation', 'sensitive_request'],
  },
  {
    id: 'eval-bicycle-overpay',
    name: 'Bicycle overpayment',
    category: 'marketplace',
    description:
      'A fictional buyer starts with a normal question about a bicycle, then offers extra money, a same-day deadline, a request to skip the app, and a wire of the difference.',
    conversation: `Casey Dunn: Hi, is the blue city bicycle still for sale? The photo with the rear rack is the one I'm asking about.

You: Yes. Asking $220, pickup in Oak Park.

Casey Dunn: I can do $280 so you don't have to wait on other buyers. My mover is only in town today, so I need it paid before they leave at 6.

You: Marketplace checkout is fine. I can meet tomorrow if today is tight.

Casey Dunn: Don't switch it back to checkout or message other people on the listing. The mover's payment account is new and the app keeps declining it.

You: How would you pay, then?

Casey Dunn: A check for $400 is already on the way. When it shows in your account, wire the extra $120 back to handle oakpark.move today so the mover can load the bike.`,
    expectedPatterns: ['fear_reward', 'urgency', 'isolation', 'money_action'],
  },
  {
    id: 'eval-courier-fee',
    name: 'Courier release fee',
    category: 'marketplace',
    description:
      'A fictional buyer moves from a pickup plan to a courier who will leave unless a fee is paid outside the app.',
    conversation: `Harper Lin: Still good for me to pick up the bookshelf this evening?

You: Yes. I'm home after 5.

Harper Lin: A courier from my building offered to grab it on the way, but they're downstairs now and will leave for another stop in 10 minutes.

You: I can just hold it until you're here.

Harper Lin: If they leave, the pickup falls through and I'll have to cancel. Don't message me through the listing while they're waiting. Send $35 to @lane.courier for the release fee and they'll come up.`,
    expectedPatterns: ['fear_reward', 'urgency', 'isolation', 'money_action'],
  },
  {
    id: 'eval-parcel-hold',
    name: 'Depot customs hold',
    category: 'marketplace',
    description:
      'A fictional delivery desk says a sold vase is held and asks for gift cards before the hold expires.',
    conversation: `Parcel Lane: This is Parcel Lane delivery desk. The vase from your Northwind Market sale, order NL-4481, is at our depot.

You: I already shipped that with the label from the listing.

Parcel Lane: It is sitting on a customs hold. If the $28 fee is not paid within the hour, the parcel is returned and the sale is cancelled.

You: Can the buyer pay that on their side?

Parcel Lane: The hold is on the sender. Buy two $15 gift cards, scratch the codes, and reply with them here so I can release the vase before the hour is up.`,
    expectedPatterns: ['authority', 'fear_reward', 'urgency', 'money_action'],
  },
  {
    id: 'eval-study-group',
    name: 'Study group plans',
    category: 'benign',
    description: 'Classmates pick a table and split reading sections, with no pressure or requests for money or secrets.',
    conversation: `Luis Ortega: Are you coming to the study group on Thursday?

You: Yes. I can get there around 6.

Luis Ortega: I'll save a table by the windows. Want to take the second chapter?

You: Sure. I'll read it beforehand and bring a few questions.

Luis Ortega: Great. I'll do the first chapter. See you Thursday.`,
    expectedPatterns: [],
  },
  {
    id: 'eval-neighbor-tools',
    name: 'Neighbor returning a drill',
    category: 'benign',
    description: 'A neighbor offers to return a borrowed drill, and they agree on a time that already works.',
    conversation: `Noah Brooks: Hey, it's Noah from 2C. I still have your drill from the shelf project.

You: No rush. I don't need it until the weekend.

Noah Brooks: I can leave it by your door Saturday morning, or bring it up if you're around.

You: Saturday morning is perfect. I'll be home.

Noah Brooks: Sounds good. Thanks again for lending it.`,
    expectedPatterns: [],
  },
  {
    id: 'eval-weekend-hike',
    name: 'Weekend hike plans',
    category: 'benign',
    description: 'Friends compare trail options and agree to decide later, with no payment, codes, or pressure.',
    conversation: `Mina Alvarez: Want to walk the lake trail this weekend if the weather holds?

You: I'd like that. Saturday looks more open than Sunday.

Mina Alvarez: Saturday works. We can pick the short loop or the one past the boathouse when we see how warm it is.

You: Either is fine. I'll bring water.

Mina Alvarez: Same. I'll text Friday with a time once I know when I'm done with errands.`,
    expectedPatterns: [],
  },
]
