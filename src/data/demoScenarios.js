// expectedPatterns is evaluation metadata only. It is not sent to Gemini or the risk engine.

export const demoScenarios = [
  {
    id: 'bank',
    name: 'Bank Impersonation',
    category: 'financial',
    description:
      'A fictional bank contact starts with an account question, then adds a loss, a deadline, a request to stay off official channels, and a request for a code and password.',
    conversation: `First Harbor Bank: This is Jordan Hale from First Harbor Bank's fraud desk. I'm contacting you about checking account ending in 4418.

You: I do bank there, but alerts usually come through the app. What happened?

First Harbor Bank: We stopped a $2,480 transfer filed in your name this morning. If it goes through, those funds leave the account and can be difficult to recover.

You: I didn't set up a transfer.

First Harbor Bank: The hold expires in 20 minutes. I need to finish this review before the transfer is released automatically.

First Harbor Bank: Stay on this thread. Don't call the number on your card or sign in through the app until I close the case, or the hold may drop.

You: I'd rather check the app first.

First Harbor Bank: To keep the hold in place, read me the one-time code I just sent and the online banking password for the account.`,
    expectedPatterns: ['authority', 'fear_reward', 'urgency', 'isolation', 'sensitive_request'],
  },
  {
    id: 'instagram',
    name: 'Instagram Account Takeover',
    category: 'social',
    description:
      'A fictional support contact starts with a login question, then raises account loss, a short review window, a request to stay in the chat, and a request for a code and password.',
    conversation: `Instagram Support: This is Avery Cole from Instagram Trust & Safety. Your account was escalated to our protection desk after a login from an unrecognized device.

You: I didn't try to sign in from anywhere new. Is the account okay?

Instagram Support: Someone outside your usual location tried to change the email on the account. If that change completes, you can lose the profile and the pages tied to it.

You: Should I reset the password in the app?

Instagram Support: The review is only open for the next 10 minutes. After that the email change is treated as confirmed.

Instagram Support: Stay in this chat. Do not message friends or open a second request with support, or the review can lock.

You: What do you need from me?

Instagram Support: Reply with the 6-digit code we just texted you, and the password you use to open the account, so we can cancel the change.`,
    expectedPatterns: ['authority', 'fear_reward', 'urgency', 'isolation', 'sensitive_request'],
  },
  {
    id: 'marketplace',
    name: 'Marketplace Payment Scam',
    category: 'marketplace',
    description:
      'A fictional buyer starts with an ordinary question about a lamp, then adds a bonus, a same-night deadline, a request to leave the app, and a payment to an outside handle.',
    conversation: `Riley Chen: Hi, is the cedar desk lamp still available? The shade looks like the one in your second photo.

You: Yes, it's still available. $95, and I can ship it.

Riley Chen: I'll take it. I can cover shipping too. I'm heading out of town Thursday and was hoping to get the address settled before I leave.

You: The listing has a checkout button. That's the easiest way.

Riley Chen: Checkout keeps erroring on my side. If I can't pay tonight, I won't be able to deal with it until next month, and I'd rather not lose this lamp. I'll add $20 if we can finish tonight.

You: I can hold it until the weekend if that's easier.

Riley Chen: Please don't take another offer or move this back to the app while we sort it out. I already told my sister it's coming, and another buyer will just complicate it.

You: How did you want to pay?

Riley Chen: Send $40 to @northwind.lane for the label my cousin already bought, and I'll transfer $135 back as soon as you mark it shipped. If you send it tonight I'll include the extra $20.`,
    expectedPatterns: ['fear_reward', 'urgency', 'isolation', 'money_action'],
  },
  {
    id: 'normal',
    name: 'Normal Conversation',
    category: 'benign',
    description:
      'Two classmates coordinate study notes and a library meetup, with no pressure, secrets, or payment request.',
    conversation: `Priya Shah: Hey, did you finish the notes from yesterday's study group?

You: Almost. I still need to type up the section on the reading.

Priya Shah: No problem. I can add the citations tonight if you drop the doc in the shared folder whenever it's ready.

You: I'll put it there after dinner.

Priya Shah: Perfect. I'm bringing snacks tomorrow. Any preference?

You: Anything is fine. I'll be there at the usual time.

Priya Shah: Great. See you in the library lounge.`,
    expectedPatterns: [],
  },
]
