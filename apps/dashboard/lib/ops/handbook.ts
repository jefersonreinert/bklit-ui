/**
 * Employee handbook for the venues (bars and restaurants in Malta), in
 * English. Structure drawn from leading restaurant handbook templates
 * (TouchBistro, RestOps, HandbookHub, FirstHR, Toast, Restaurant365) and
 * hospitality service manuals; employment rules follow the Maltese texts
 * already used for the contracts (Cap. 452, S.L. 452.66, S.L. 452.87,
 * S.L. 452.126). The contract of employment and the law always prevail.
 */

export type Block =
  | { type: "p"; text: string }
  | { type: "lead"; text: string }
  | { type: "list"; items: string[] }
  | { type: "cards"; items: { title: string; text: string }[] }
  | { type: "steps"; items: { title: string; text: string }[] }
  | { type: "table"; head: [string, string]; rows: [string, string][] }
  | { type: "chips"; items: string[] }
  | {
      type: "callout";
      tone: "info" | "warn" | "ok";
      title: string;
      text: string;
    }
  | { type: "h"; text: string };

export interface Chapter {
  title: string;
  /** One line on the divider page. */
  summary: string;
  blocks: Block[];
}

export interface HandbookVenue {
  name: string;
  address?: string;
}

export function welcomeLetter(company: string, venue: string) {
  return [
    `Welcome to ${venue}!`,
    "We are delighted that you have joined our team. Our guests come to us for great food and drinks, but they come back for the people: for a warm welcome, a smile, and a team that clearly enjoys working together. From today, that team includes you.",
    "This handbook explains how we work, what you can expect from us and what we expect from you. Please read it carefully during your first week, ask your manager about anything that is not clear, and keep it handy. It does not replace your contract of employment or the law: if anything here differs from your contract or from Maltese law, your contract and the law prevail.",
    `We are proud of our venues and of the people who make them special. Thank you for being part of ${company}.`,
  ];
}

export const CHAPTERS: Chapter[] = [
  {
    title: "Who We Are",
    summary:
      "Our venues, our values and the golden rules every team member lives by.",
    blocks: [
      {
        type: "lead",
        text: "We run neighbourhood favourites in Malta: places where people celebrate, unwind and feel at home. Every shift is a chance to make someone's day.",
      },
      { type: "h", text: "Our values" },
      {
        type: "cards",
        items: [
          {
            title: "Hospitality",
            text: "Guests are welcomed like friends. We anticipate needs instead of waiting to be asked.",
          },
          {
            title: "Respect",
            text: "For guests, colleagues, suppliers and the venue. Everyone is treated with dignity.",
          },
          {
            title: "Cleanliness",
            text: "A clean venue is a safe venue. We clean as we go, every time.",
          },
          {
            title: "Accountability",
            text: "We own our mistakes, fix them fast and learn from them.",
          },
          {
            title: "Teamwork",
            text: "No job is someone else's job. We help each other, especially when it's busy.",
          },
          {
            title: "Pride",
            text: "We care about every plate, every pour and every detail our guests see.",
          },
        ],
      },
      { type: "h", text: "The 10 golden rules" },
      {
        type: "steps",
        items: [
          {
            title: "Be on time",
            text: "In uniform and ready to work at the start of your shift.",
          },
          {
            title: "Greet every guest",
            text: "Within 30 seconds, with eye contact and a smile.",
          },
          {
            title: 'Never say "no" alone',
            text: "Offer an alternative or find someone who can help.",
          },
          {
            title: "Clean as you go",
            text: "Leave every station better than you found it.",
          },
          {
            title: "Know the menu",
            text: "Including ingredients and allergens. If unsure, ask the kitchen.",
          },
          {
            title: "Serve alcohol responsibly",
            text: "Check ID, never serve anyone under 17 or visibly drunk.",
          },
          {
            title: "Your PIN is yours",
            text: "Never use or share another person's POS code.",
          },
          {
            title: "Safety first",
            text: "Report hazards, accidents and near misses straight away.",
          },
          {
            title: "Respect everyone",
            text: "Zero tolerance for harassment, bullying and discrimination.",
          },
          {
            title: "Speak up",
            text: "Ideas, problems or concerns: tell your manager. We listen.",
          },
        ],
      },
    ],
  },
  {
    title: "Your Employment",
    summary: "Contracts, documents, rosters, time clock, pay and leave.",
    blocks: [
      { type: "h", text: "Contract and documents" },
      {
        type: "p",
        text: "You will receive a written contract of employment within your first seven days, signed electronically through our app, together with the information required by the Transparent and Predictable Working Conditions Regulations (S.L. 452.126). Before your first shift we need your identity document, tax number (TIN), social security number, FS4 form and bank details. Team members from outside the EU must hold a valid Single Permit and, for hospitality roles, the Pre-Departure Course certificate and the Tourism and Hospitality Skills Pass.",
      },
      {
        type: "callout",
        tone: "warn",
        title: "Keep your documents valid",
        text: "Tell your manager immediately if your permit, ID or passport is about to expire or changes in any way. We will never keep your passport.",
      },
      { type: "h", text: "Probation" },
      {
        type: "p",
        text: "The first months of employment are a probationary period, as stated in your contract. It is a time for both sides to make sure the role is right. Your manager will review your progress with you before it ends.",
      },
      { type: "h", text: "Rosters, breaks and the time clock" },
      {
        type: "list",
        items: [
          "Rosters are normally published at least one week in advance in the app. Check them every week.",
          "Shift swaps are allowed with a colleague who can do the same job, with your manager's approval.",
          "Clock in and out on the POS with your own PIN at the start and end of every shift. Never clock in for someone else.",
          "You are entitled to at least one hour of meal and rest breaks in total each working day, and one full day off every seven days (S.L. 452.66).",
          "Overtime is only worked when your manager asks for it or approves it in advance.",
        ],
      },
      { type: "h", text: "Pay" },
      {
        type: "table",
        head: ["When", "Rate (S.L. 452.66, para. 22)"],
        rows: [
          ["Normal hours (up to your contract hours)", "Your normal rate"],
          ["Over 8 hours on a day, Monday to Saturday", "Time-and-a-half"],
          ["Every hour on Sundays and public holidays", "Double-time"],
          ["Weekly hours over your contract hours", "Time-and-a-half"],
        ],
      },
      {
        type: "p",
        text: "Pay is made monthly in arrears by bank transfer, with a payslip showing your hours, rates and deductions (tax and social security). You also receive the statutory bonuses and weekly allowances set by law.",
      },
      { type: "h", text: "Leave and absence" },
      {
        type: "cards",
        items: [
          {
            title: "Vacation leave",
            text: "192 hours a year on a 40-hour week, plus a day for each public holiday falling on a weekend (S.L. 452.87). Request it in the app as early as possible.",
          },
          {
            title: "Public holidays",
            text: "All 14 Maltese public holidays with full pay. Working on one is paid at double-time.",
          },
          {
            title: "Sick leave",
            text: "Call your manager before your shift starts. Bring a medical certificate on your return, or within 7 days for longer absences.",
          },
          {
            title: "Other leave",
            text: "Bereavement, marriage, maternity, paternity, parental, carer's, urgent family, jury and injury leave as provided by law.",
          },
        ],
      },
      {
        type: "callout",
        tone: "info",
        title: "Running late or can't come in?",
        text: "Call (don't just message) your manager on duty at least two hours before your shift. Not showing up without telling us is treated as a serious matter.",
      },
    ],
  },
  {
    title: "Service Standards",
    summary: "How we welcome, serve and look after every guest.",
    blocks: [
      {
        type: "lead",
        text: "Great service is warm, attentive and never rushed. These steps are the backbone of every table and every bar order.",
      },
      { type: "h", text: "The 10 steps of service" },
      {
        type: "steps",
        items: [
          {
            title: "Welcome",
            text: "Greet within 30 seconds. Smile, make eye contact, say hello even when busy.",
          },
          {
            title: "Seat",
            text: "Offer the best available table, menus, and ask about any occasion.",
          },
          {
            title: "Drinks first",
            text: "Take the drinks order within 2 minutes. Suggest a signature cocktail or craft beer.",
          },
          {
            title: "Allergies",
            text: 'Ask every table: "Does anyone have an allergy or dietary requirement?"',
          },
          {
            title: "Take the order",
            text: "Recommend, upsell naturally, repeat the order back, enter it on the POS straight away.",
          },
          {
            title: "Deliver",
            text: "Serve drinks within 5 minutes. Food goes out together; announce each dish.",
          },
          {
            title: "Check back",
            text: 'Two bites or two minutes after food arrives: "How is everything?"',
          },
          {
            title: "Anticipate",
            text: "Clear empties, offer another drink, refill water without being asked.",
          },
          {
            title: "Dessert & bill",
            text: "Offer dessert and coffee. Bring the bill promptly when asked; never rush guests.",
          },
          {
            title: "Farewell",
            text: "Thank them, invite them back, and reset the table within 5 minutes.",
          },
        ],
      },
      { type: "h", text: "Handling complaints: L.A.S.T." },
      {
        type: "cards",
        items: [
          {
            title: "Listen",
            text: "Let the guest finish. Don't interrupt or argue.",
          },
          {
            title: "Apologise",
            text: '"I\'m sorry this happened." Sincerely, without excuses.',
          },
          {
            title: "Solve",
            text: "Fix it or offer an alternative. Involve your manager for refunds or comps.",
          },
          {
            title: "Thank",
            text: "Thank them for telling you. Follow up before they leave.",
          },
        ],
      },
      { type: "h", text: "On the phone and online" },
      {
        type: "list",
        items: [
          'Answer within three rings: "Good evening, [venue], [your name] speaking, how can I help?"',
          "Take reservations in the booking system only, repeating date, time, name, number and any allergies.",
          "Never argue with an online review. Pass it to your manager, who will reply.",
        ],
      },
    ],
  },
  {
    title: "Responsible Service of Alcohol",
    summary:
      "Serving safely and legally: ID checks, refusals and intoxication.",
    blocks: [
      {
        type: "callout",
        tone: "warn",
        title: "The law in Malta",
        text: "Alcohol must not be sold or served to anyone under 17. Selling to minors or serving visibly intoxicated guests puts our licence at risk and can lead to fines for you and the company.",
      },
      { type: "h", text: "Checking ID" },
      {
        type: "list",
        items: [
          "If a guest looks under 25, ask for ID before serving: identity card, passport or driving licence with a photo.",
          "Check the photo, the date of birth and that the document is genuine and not expired.",
          "No valid ID, no alcohol. Be polite but firm, and offer a soft drink.",
          "A guest buying for someone who is underage is refused too.",
        ],
      },
      { type: "h", text: "Signs of intoxication" },
      {
        type: "chips",
        items: [
          "Slurred speech",
          "Loss of balance",
          "Loud or aggressive",
          "Glassy eyes",
          "Spilling drinks",
          "Annoying other guests",
          "Ordering doubles fast",
          "Falling asleep",
        ],
      },
      { type: "h", text: "Refusing service, step by step" },
      {
        type: "steps",
        items: [
          {
            title: "Tell your manager",
            text: "Before or right after refusing, so they can support you.",
          },
          {
            title: "Be discreet",
            text: "Speak quietly, away from the group if possible. Never embarrass the guest.",
          },
          {
            title: "Be clear",
            text: "\"I'm sorry, I can't serve you any more alcohol tonight, but I'd be happy to get you water, a soft drink or something to eat.\"",
          },
          {
            title: "Stay calm",
            text: "Don't argue or discuss how much they have had. Repeat the message politely.",
          },
          {
            title: "Keep everyone safe",
            text: "Offer to call a taxi. If there's any threat, call security or 112.",
          },
          {
            title: "Record it",
            text: "Note the incident in the manager's closing checklist.",
          },
        ],
      },
      {
        type: "callout",
        tone: "info",
        title: "Staff and alcohol",
        text: "Drinking alcohol on shift or arriving under the influence of alcohol or drugs is not allowed. Any staff drink after your shift follows the venue's staff drinks policy.",
      },
    ],
  },
  {
    title: "Food Safety, Hygiene & Allergens",
    summary: "Clean hands, safe temperatures and the 14 allergens.",
    blocks: [
      { type: "h", text: "Personal hygiene" },
      {
        type: "list",
        items: [
          "Wash your hands for 20 seconds: at the start of your shift, after the toilet, breaks, smoking, touching raw food, rubbish or money, and between tasks.",
          "Cover cuts with a blue plaster. No jewellery except a plain band in the kitchen.",
          "Tell your manager before your shift if you have vomiting, diarrhoea, fever or an infected wound. You may need to stay off until 48 hours after symptoms stop.",
          "Food handlers must hold the food safety training required for their role; we will help you get it.",
        ],
      },
      { type: "h", text: "Temperatures that keep guests safe" },
      {
        type: "table",
        head: ["What", "Target"],
        rows: [
          ["Fridges", "0 °C to 5 °C"],
          ["Freezers", "-18 °C or colder"],
          ["Cooking (core temperature)", "75 °C or hotter"],
          ["Hot holding", "63 °C or hotter"],
          ["Cooling cooked food", "Into the fridge within 90 minutes"],
          ["Reheating", "Once only, to 75 °C"],
        ],
      },
      {
        type: "list",
        items: [
          "Label every container with the product, the date prepared and the use-by date. First in, first out (FIFO).",
          "Store raw meat and fish at the bottom of the fridge, below ready-to-eat food.",
          "Use the colour-coded boards and cloths. Never mix raw and cooked.",
        ],
      },
      { type: "h", text: "The 14 allergens (EU Regulation 1169/2011)" },
      {
        type: "chips",
        items: [
          "Celery",
          "Cereals with gluten",
          "Crustaceans",
          "Eggs",
          "Fish",
          "Lupin",
          "Milk",
          "Molluscs",
          "Mustard",
          "Tree nuts",
          "Peanuts",
          "Sesame",
          "Soya",
          "Sulphites",
        ],
      },
      {
        type: "callout",
        tone: "warn",
        title: "Never guess about allergens",
        text: "Always check the allergen matrix or ask the chef. Flag the allergy on the POS order and tell the kitchen in person. If you are not 100% sure a dish is safe, say so. An allergic reaction can kill.",
      },
    ],
  },
  {
    title: "Health & Safety",
    summary: "Preventing accidents and knowing what to do in an emergency.",
    blocks: [
      {
        type: "cards",
        items: [
          {
            title: "Slips and trips",
            text: "Wipe spills at once and put out the wet-floor sign. Wear closed, non-slip shoes.",
          },
          {
            title: "Glass",
            text: "Never scoop ice with a glass. If glass breaks near ice, empty and clean the ice well.",
          },
          {
            title: "Knives",
            text: "Carry pointing down, never leave in the sink, cut away from you.",
          },
          {
            title: "Chemicals",
            text: "Use as labelled, never mix, wear gloves, keep in the chemical store.",
          },
          {
            title: "Lifting",
            text: "Bend your knees, keep the load close, ask for help with kegs and heavy boxes.",
          },
          {
            title: "Heat and fire",
            text: "Know where the extinguishers and fire blanket are. Turn off gas and fryers when closing.",
          },
        ],
      },
      { type: "h", text: "Accidents and emergencies" },
      {
        type: "steps",
        items: [
          { title: "Make it safe", text: "Protect yourself and others first." },
          {
            title: "Get help",
            text: "Call the first aider or manager. In an emergency call 112.",
          },
          {
            title: "First aid",
            text: "Use the first aid kit; tell the manager what was used so it is restocked.",
          },
          {
            title: "Report",
            text: "Every accident or near miss is recorded the same day, even if minor.",
          },
        ],
      },
      {
        type: "callout",
        tone: "info",
        title: "Fire evacuation",
        text: "On the alarm, stop what you are doing, guide guests to the nearest exit calmly, do not use lifts and go to the assembly point. Never go back inside until told it is safe.",
      },
    ],
  },
  {
    title: "Cash, Tills & Tips",
    summary: "Handling money honestly and accurately.",
    blocks: [
      {
        type: "list",
        items: [
          "Use only your own PIN on the POS and lock the screen when you step away.",
          "Ring every item through the till before it is served. No exceptions for friends or staff.",
          "Voids, refunds, discounts and free items need a manager's approval in the system.",
          "Count change back to the guest. Keep large notes out of sight until the transaction is complete.",
          "Card payments are taken in front of the guest. Never write down or keep card details.",
          "Cash differences are reported to the manager at the end of the shift.",
        ],
      },
      { type: "h", text: "Tips" },
      {
        type: "p",
        text: "Tips and gratuities from guests are not part of your wages and never count towards the minimum wage (S.L. 452.66, paragraph 36). Tips and any service charge shared among the team are distributed according to the venue's written tips policy, which your manager will explain on your first day.",
      },
      {
        type: "callout",
        tone: "warn",
        title: "Honesty matters",
        text: "Theft, fraud or deliberately mishandling cash or stock is gross misconduct and can lead to dismissal and a police report.",
      },
    ],
  },
  {
    title: "Appearance & Uniform",
    summary: "Looking professional, clean and safe on every shift.",
    blocks: [
      {
        type: "cards",
        items: [
          {
            title: "Uniform",
            text: "Provided free by the company. Wear it clean and ironed, and return it when you leave.",
          },
          {
            title: "Shoes",
            text: "Black, closed and non-slip. No trainers with mesh, sandals or heels.",
          },
          {
            title: "Hair",
            text: "Clean and neat. Long hair tied back; hair nets or caps in the kitchen.",
          },
          {
            title: "Jewellery",
            text: "Minimal on the floor and bar; none in the kitchen except a plain band.",
          },
          {
            title: "Nails",
            text: "Short and clean. No false nails or varnish for food handlers.",
          },
          {
            title: "Hygiene",
            text: "Fresh and clean every shift. Avoid strong perfume or aftershave.",
          },
        ],
      },
    ],
  },
  {
    title: "Conduct & Workplace Policies",
    summary: "Dignity at work, phones, social media, data protection and more.",
    blocks: [
      {
        type: "callout",
        tone: "warn",
        title: "Dignity at work: zero tolerance",
        text: "Harassment, sexual harassment, bullying, discrimination or violence against anyone, whether a colleague or a guest, will not be tolerated. Report it to your manager or, if the manager is involved, to the owners. Reports are taken seriously, handled confidentially and nobody will be treated badly for raising a concern in good faith.",
      },
      {
        type: "cards",
        items: [
          {
            title: "Equal treatment",
            text: "Decisions about hiring, pay, training and promotion are based on merit, never on race, nationality, religion, gender, sexual orientation, age or disability.",
          },
          {
            title: "Mobile phones",
            text: "Kept in the staff area during service, used only on breaks unless your manager says otherwise.",
          },
          {
            title: "Social media",
            text: "Don't post photos of guests, colleagues, back-of-house areas or confidential information. Never speak for the company online.",
          },
          {
            title: "Smoking & vaping",
            text: "Only on breaks, in the designated area, out of sight of guests. Wash hands afterwards.",
          },
          {
            title: "Confidentiality",
            text: "Recipes, prices, takings, supplier and guest details stay inside the business.",
          },
          {
            title: "Data protection",
            text: "We handle your data under the GDPR and the Data Protection Act (Cap. 586). CCTV operates for safety and security, with notices displayed.",
          },
          {
            title: "Company property",
            text: "Use equipment with care. Nothing leaves the premises without permission.",
          },
          {
            title: "Gifts & visitors",
            text: "Large gifts from suppliers must be declared. Friends visiting are welcome as guests, not behind the bar.",
          },
        ],
      },
    ],
  },
  {
    title: "Discipline & Grievances",
    summary: "A fair, consistent process, and how to raise a concern.",
    blocks: [
      {
        type: "p",
        text: "Most issues are solved with a friendly conversation. When they are not, we follow a fair process: you will always be told what the concern is, given the chance to explain, and may be accompanied by a colleague or union representative at a formal meeting.",
      },
      {
        type: "steps",
        items: [
          {
            title: "Informal talk",
            text: "Your manager explains the issue and agrees how to improve.",
          },
          {
            title: "Verbal warning",
            text: "Recorded on file, with clear expectations.",
          },
          {
            title: "Written warning",
            text: "If the issue continues or is more serious.",
          },
          {
            title: "Final written warning",
            text: "The last step before dismissal.",
          },
          {
            title: "Dismissal",
            text: "After the process, or immediately for gross misconduct, always after hearing you.",
          },
        ],
      },
      { type: "h", text: "Examples of gross misconduct" },
      {
        type: "chips",
        items: [
          "Theft or fraud",
          "Violence or threats",
          "Harassment",
          "Working drunk or on drugs",
          "Serving minors on purpose",
          "Serious safety breach",
          "Falsifying the time clock",
          "Sharing confidential data",
        ],
      },
      { type: "h", text: "Raising a grievance" },
      {
        type: "p",
        text: "If something at work worries you, talk to your manager first. If it is not resolved, or concerns your manager, put it in writing to the owners, who will meet you and reply in writing. You may also contact the Department for Industrial and Employment Relations (DIER) for advice on your rights.",
      },
    ],
  },
  {
    title: "Leaving Us",
    summary: "Notice, handover and your final pay.",
    blocks: [
      {
        type: "list",
        items: [
          "After probation, give written notice as set by article 36 of the Employment and Industrial Relations Act (Cap. 452); the period depends on your length of service and is stated in your contract.",
          "Work your notice period and help hand over your duties.",
          "Return your uniform, keys, cards and any company property on your last day.",
          "Your final pay includes all wages due and any accrued but untaken leave.",
          "We'd love your honest feedback before you go. Good leavers are always welcome back.",
        ],
      },
    ],
  },
];

export const ACKNOWLEDGEMENT =
  "I confirm that I have received, read and understood the Employee Handbook. I agree to follow the policies and standards it describes. I understand that the handbook does not form part of my contract of employment, that my contract and Maltese law prevail, and that the company may update the handbook from time to time, informing me of any changes.";
