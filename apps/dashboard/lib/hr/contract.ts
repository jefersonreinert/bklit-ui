/**
 * Contract of employment for bars and restaurants in Malta, built from the
 * HR file. Covers every item employers must give in writing under the
 * Transparent and Predictable Working Conditions Regulations (S.L. 452.126,
 * reg. 5(1)(a)–(q)) and the sector rules of the Hotels and Clubs Wages
 * Council Wage Regulation Order (S.L. 452.66, Part III: coffee shops, bars
 * and restaurants; Part V: leave), the Organisation of Working Time
 * Regulations (S.L. 452.87) and the Employment and Industrial Relations Act
 * (Cap. 452). Texts read from legislation.mt in November 2026.
 * To be reviewed once by a Maltese lawyer or accountant.
 */

export interface ContractFields {
  employer: {
    name: string;
    regNo: string;
    address: string;
    signatory: string;
    signatoryTitle: string;
  };
  employee: {
    name: string;
    /** "identity card" or "passport". */
    idLabel: string;
    idNumber: string;
    address: string;
    nationality: string;
    gender?: string;
  };
  origin: "eu" | "non-eu";
  jobTitle: string;
  workplace: { name: string; address: string };
  /** YYYY-MM-DD. */
  date: string;
  startDate: string;
  /** Fixed term; empty = indefinite. */
  endDate?: string;
  probationMonths: number;
  weeklyHours: number;
  payType: "hourly" | "monthly";
  monthlySalary?: number;
  hourlyRate?: number;
  overtime: number;
  sunday?: number;
  holiday?: number;
}

export interface ContractDoc {
  title: string;
  parties: string[];
  sections: { heading: string; paragraphs: string[] }[];
}

/**
 * Minimum weekly wage for whole-time employees aged 18+ in bars and
 * restaurants (S.L. 452.66 para 19, as amended by L.N. 288 of 2025),
 * for a week of up to 40 hours. Update every January.
 */
export const MIN_WEEKLY_WAGE = 230.61;
export const MIN_WAGE_YEAR = 2026;

/** Whether the agreed pay is below the sector minimum (for 40 h). */
export function belowMinimum(
  f: Pick<
    ContractFields,
    "payType" | "monthlySalary" | "hourlyRate" | "weeklyHours"
  >
) {
  const hourlyMin = MIN_WEEKLY_WAGE / 40;
  if (f.payType === "hourly") {
    return (f.hourlyRate ?? 0) < hourlyMin - 0.005;
  }
  const weekly = ((f.monthlySalary ?? 0) * 12) / 52;
  return weekly < hourlyMin * Math.min(40, f.weeklyHours) - 0.005;
}

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

/** "2026-07-15" → "15 July 2026". */
export function longDate(day: string | undefined) {
  if (!day) {
    return "________";
  }
  const [y, m, d] = day.split("-").map(Number);
  return `${d} ${MONTHS[(m ?? 1) - 1]} ${y}`;
}

const eur = (n: number | undefined) =>
  n === undefined
    ? "€________"
    : `€${n.toLocaleString("en-GB", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })}`;

const blank = (s: string | undefined) => (s?.trim() ? s.trim() : "________");

const WORDS = [
  "zero",
  "one",
  "two",
  "three",
  "four",
  "five",
  "six",
  "seven",
  "eight",
  "nine",
  "ten",
  "eleven",
  "twelve",
];
const months = (n: number) =>
  `${WORDS[n] ?? n} (${n}) month${n === 1 ? "" : "s"}`;
const times = (n: number | undefined, fallback: number) => {
  const v = n ?? fallback;
  if (v === 1.5) {
    return "time-and-a-half";
  }
  if (v === 2) {
    return "double-time";
  }
  return `${v} times the normal hourly rate`;
};

/** Short description of common roles (reg. 5(1)(d)). */
const DUTIES: [RegExp, string][] = [
  [
    /bar ?(tender|man|maid|staff)|mixolog/i,
    "preparing and serving drinks, cocktails and light food at the bar, taking orders and payments, keeping the bar, glassware and stock clean and organised, checking stock and serving alcohol responsibly",
  ],
  [
    /waiter|waitress|server|runner|floor/i,
    "welcoming guests, taking and serving food and drink orders, advising on the menu, laying and clearing tables, handling payments and keeping the dining areas clean",
  ],
  [
    /chef|cook|kitchen|commis|grill/i,
    "preparing, cooking and presenting food to the Company's recipes and standards, receiving and storing deliveries, rotating stock, and keeping the kitchen clean in line with food safety (HACCP) rules",
  ],
  [
    /porter|dish|steward|cleaner/i,
    "washing dishes, glassware and kitchen equipment, cleaning the kitchen, stores and premises, handling waste and helping with deliveries",
  ],
  [
    /barista|coffee/i,
    "preparing and serving coffee and other beverages, serving customers, handling payments and keeping the coffee station clean",
  ],
  [
    /host|hostess|reception/i,
    "welcoming and seating guests, managing reservations and waiting lists, and answering telephone and online enquiries",
  ],
  [
    /manager|supervisor|head|lead/i,
    "supervising the shift and the team, organising rosters and tasks, ensuring service quality, cash handling, stock control, opening and closing procedures and compliance with health, safety and licensing rules",
  ],
];

function duties(job: string) {
  const hit = DUTIES.find(([re]) => re.test(job));
  return hit
    ? hit[1]
    : "the duties normally associated with this role in a bar and restaurant";
}

export function buildContract(f: ContractFields): ContractDoc {
  const company = blank(f.employer.name);
  const job = blank(f.jobTitle);
  const hourly = f.payType === "hourly";
  const pay = hourly
    ? `The Employee shall be paid a gross wage of ${eur(f.hourlyRate)} per hour worked, on the basis of the hours recorded in the Company's time-keeping system.`
    : `The Employee shall be paid a gross salary of ${eur(f.monthlySalary)} per month for the normal working hours set out in clause 5.`;
  const term = f.endDate
    ? `The Employment shall commence on ${longDate(f.startDate)} (the "Effective Date") and is for a definite term ending on ${longDate(f.endDate)}, unless terminated earlier in accordance with this Agreement and the law. The Employee's rights on the conversion of successive definite contracts into an indefinite contract under the Contracts for Service for a Fixed Term Regulations are not affected.`
    : `The Employment shall commence on ${longDate(f.startDate)} (the "Effective Date") and is for an indefinite period.`;

  const sections: ContractDoc["sections"] = [
    {
      heading: "1. Appointment, Duration and Probation",
      paragraphs: [
        `1.1 The Company employs the Employee as ${job} on a whole-time basis, and the Employee accepts the Employment on the terms of this Agreement.`,
        `1.2 ${term}`,
        `1.3 The first ${months(f.probationMonths)} of the Employment shall be a probationary period. During this period either party may terminate the Employment without assigning a reason, subject to the notice required by article 36 of the Employment and Industrial Relations Act (Cap. 452).`,
      ],
    },
    {
      heading: "2. Duties",
      paragraphs: [
        `2.1 The Employee's main duties are ${duties(job)}.`,
        "2.2 The Employee shall also carry out other reasonable tasks consistent with the role and the Employee's skills, and shall follow the lawful instructions of the Company and its managers.",
        "2.3 The Employee shall comply with the Company's rules on food safety and hygiene, health and safety, cash handling, responsible service of alcohol (including not serving persons under 17 years of age or visibly intoxicated persons), allergen information and the treatment of customers and colleagues.",
      ],
    },
    {
      heading: "3. Place of Work",
      paragraphs: [
        `3.1 The Employee's main place of work is ${blank(f.workplace.name)}, ${blank(f.workplace.address)}.`,
        `3.2 Where the needs of the business so require, the Company may ask the Employee to work at its other outlets in Malta, with reasonable notice. The Company's registered place of business is ${blank(f.employer.address)}.`,
      ],
    },
    {
      heading: "4. Training",
      paragraphs: [
        "4.1 The Company shall provide, at its expense and during paid working time, induction training on the Company's procedures, food safety and hygiene, allergens, health and safety and responsible service of alcohol.",
        "4.2 Where the law requires the Employee to hold a food handler's or other certificate for the role, the Company shall support the Employee in obtaining it; training that the law or this Agreement requires the Company to provide shall not be charged to the Employee.",
      ],
    },
    {
      heading: "5. Hours of Work, Rest and Rosters",
      paragraphs: [
        `5.1 The Employee's normal working week is ${f.weeklyHours} hours, worked in shifts which may include early mornings, evenings, nights, weekends and public holidays, as is usual in the hospitality sector.`,
        "5.2 The work pattern is mostly predictable. Shifts are set in a roster published normally at least one (1) week in advance. Changes to a published roster shall be agreed with the Employee or notified as early as possible, save in emergencies; the Employee may request to swap shifts with a colleague, subject to the manager's approval.",
        "5.3 The Employee is entitled to intervals of not less, in aggregate, than one (1) hour for meals and rest every working day, and to one whole day off in every period of seven consecutive days, as provided by S.L. 452.66, together with the daily and weekly rest periods of the Organisation of Working Time Regulations (S.L. 452.87).",
        "5.4 Working time, including overtime, shall not exceed an average of forty-eight (48) hours a week unless the Employee agrees otherwise in a separate written statement, which the Employee may withdraw by giving notice as provided by law. Night work shall be organised in accordance with S.L. 452.87, including the free health assessment due to night workers.",
      ],
    },
    {
      heading: "6. Overtime, Sundays and Public Holidays",
      paragraphs: [
        "6.1 Overtime shall only be worked when requested or approved in advance by the Employee's manager.",
        `6.2 In accordance with paragraph 22 of S.L. 452.66, the Employee shall be paid at least: (a) ${times(f.overtime, 1.5)} for all hours worked in excess of eight (8) hours on any day from Monday to Saturday; (b) ${times(f.sunday, 2)} for all hours worked on Sundays and public holidays; and (c) ${times(f.overtime, 1.5)} for all hours worked in any calendar week in excess of the ${f.weeklyHours} normal hours, excluding the hours already paid under (a) and (b).`,
        "6.3 Where the Employee works on a Sunday or public holiday and is paid at double-time, the weekly day off in clause 5.3 may be adjusted as permitted by S.L. 452.66.",
      ],
    },
    {
      heading: "7. Remuneration",
      paragraphs: [
        `7.1 ${pay} The pay shall never be lower than the minimum remuneration established by S.L. 452.66 and the national minimum wage, as revised from time to time.`,
        "7.2 The Employee shall also receive the statutory bonuses and weekly allowances, and any cost-of-living increase, as prescribed by law.",
        "7.3 Pay is due monthly in arrears and shall be paid by bank transfer to the account indicated by the Employee by the last working day of each month, together with a payslip showing the hours, rates, overtime and deductions.",
        "7.4 Income tax (FSS) and the Employee's social security contributions shall be deducted as required by law. No other deduction shall be made from the Employee's pay unless permitted by law or agreed by the Employee in writing in accordance with the law. The Company does not impose fines.",
        "7.5 Tips and gratuities given by customers are not part of the remuneration and do not count towards the minimum wage (S.L. 452.66, paragraph 36). Any tips or service charge shared among staff shall be distributed according to the Company's written tips policy.",
        "7.6 The Employee may ask in writing for information on the Employee's own pay level and on the pay levels of the categories of workers doing the same work, which the Company shall provide within two (2) months (S.L. 452.126, reg. 5A).",
      ],
    },
    {
      heading: "8. Leave",
      paragraphs: [
        "8.1 Vacation leave: the Employee is entitled to paid annual leave of at least four (4) weeks and thirty-two (32) hours a year on the basis of a forty-hour week (one hundred and ninety-two (192) hours), plus one additional day for each public holiday falling on a Saturday, Sunday or weekly day off, pro rata for part of a year and adjusted where the average normal week differs from forty hours (S.L. 452.87, reg. 8). Leave is taken at times agreed with the Company. Up to fifty per cent (50%) of the entitlement may, by mutual agreement, be carried over once to the following year as provided by law.",
        "8.2 Public holidays: the Employee is entitled to all national and public holidays with full pay.",
        "8.3 Sick leave: after completing six (6) months of employment, the Employee is entitled every calendar year to the equivalent in hours of fifteen (15) days of sick leave on full pay and a further thirty-six (36) days on half pay, less the social security sickness benefit, as set out in paragraph 23 of S.L. 452.66, the first three (3) days of each claim being paid by the Company. The Employee shall inform the manager on the first day of absence and produce a medical certificate on the day of return or, for absences longer than seven (7) days, within seven days. The Company may ask its own doctor to certify the incapacity.",
        "8.4 Injury leave: if injured in the actual discharge of duty, without contributory negligence or breach of safety rules, the Employee is entitled to up to one (1) year of injury leave on full pay, less any injury benefit (S.L. 452.66, paragraph 34).",
        "8.5 Bereavement leave: two (2) days of paid leave on the death of a spouse, parent, child, brother or sister (S.L. 452.66, paragraph 32), or more if the law so provides.",
        "8.6 Marriage leave: three (3) days of paid leave on the Employee's marriage (S.L. 452.66, paragraph 33), or more if the law so provides.",
        "8.7 Jury service: all necessary time off on full pay (S.L. 452.66, paragraph 35).",
        "8.8 Maternity, paternity, birth, adoption, parental, carer's, urgent family and quarantine leave, and any other leave, are granted in accordance with the laws in force, which the Company shall explain on request.",
      ],
    },
    {
      heading: "9. Uniform and Meals",
      paragraphs: [
        "9.1 The Company shall provide the Employee's uniform free of charge. The Employee shall keep it clean and in good condition and return it when the Employment ends.",
        "9.2 Where the Company provides a staff meal during a shift, no deduction shall be made for it unless agreed in writing and within the limits allowed by S.L. 452.66.",
      ],
    },
    {
      heading: "10. Conduct, Cash and Company Property",
      paragraphs: [
        "10.1 The Employee shall not work under the influence of alcohol or drugs, shall not consume the Company's products without authorisation, and shall follow the Company's cash and payment procedures.",
        "10.2 The Employee shall take reasonable care of the Company's property and return all keys, cards, uniforms and other property when the Employment ends.",
        "10.3 Disciplinary matters shall be dealt with fairly: the Employee shall be informed of any allegation and given the opportunity to be heard, and may be accompanied by a colleague or union representative.",
      ],
    },
    {
      heading: "11. Confidentiality and Data Protection",
      paragraphs: [
        "11.1 During and after the Employment the Employee shall not disclose or misuse confidential information of the Company, including information about customers, suppliers, recipes, prices, takings and staff.",
        "11.2 The Company processes the Employee's personal data to manage the Employment and to comply with its legal obligations, in accordance with the General Data Protection Regulation (EU) 2016/679 and the Data Protection Act (Cap. 586). CCTV may be in use on the premises for security, with notices displayed.",
      ],
    },
    {
      heading: "12. Termination",
      paragraphs: [
        "12.1 After the probationary period, either party may terminate an indefinite Employment by giving written notice of the length established by article 36 of the Employment and Industrial Relations Act (Cap. 452), which increases with the Employee's length of service. The Company may only terminate for a good and sufficient cause or on redundancy, as provided by the Act.",
        "12.2 Notice shall be given in writing and dated. A party who terminates without giving the notice required shall be liable to the other party as provided by article 36 of the Act; in the case of the Employee, to a sum equal to half the wages for the notice period.",
        "12.3 The Company may dismiss the Employee without notice for a good and sufficient cause, including gross misconduct, theft, fraud, violence, harassment, serious breach of health, safety or food safety rules, or working under the influence of alcohol or drugs, after giving the Employee the opportunity to be heard.",
        "12.4 On termination, the Company shall pay all wages due and any accrued but untaken leave, and the Employee shall return all Company property.",
      ],
    },
  ];

  let n = sections.length;
  if (f.origin === "non-eu") {
    n += 1;
    sections.push({
      heading: `${n}. Work and Residence Permit`,
      paragraphs: [
        `${n}.1 The Employee is a third-country national. The Employment is conditional on the Employee holding at all times a valid Single Permit or other permit allowing the Employee to reside and work in Malta for the Company in this role.`,
        `${n}.2 The Company shall apply for the necessary permit and its renewals and bear the related application fees. Any cost borne by the Employee shall be agreed in writing, comply with Maltese law and never be deducted unlawfully from wages.`,
        `${n}.3 The Employee shall promptly provide all documents required for the permit, including the Pre-Departure Course certificate and the Tourism and Hospitality Skills Pass where applicable, and shall inform the Company immediately of any change in immigration status. The Company shall not keep the Employee's passport.`,
        `${n}.4 If the permit expires, is refused or is revoked and cannot lawfully be renewed, the Employment shall end in accordance with the law.`,
      ],
    });
  }

  sections.push(
    {
      heading: `${n + 1}. Social Security and Collective Agreement`,
      paragraphs: [
        `${n + 1}.1 The Employee shall be insured with the Department of Social Security of Malta. Contributions are paid by the Company and the Employee as required by the Social Security Act (Cap. 318), and income tax is remitted to the Commissioner for Tax and Customs.`,
        `${n + 1}.2 No collective agreement applies to the Employment. Conditions not set out in this Agreement are governed by the Employment and Industrial Relations Act (Cap. 452), S.L. 452.66, S.L. 452.87 and the other laws in force, whose more favourable provisions always prevail.`,
      ],
    },
    {
      heading: `${n + 2}. General`,
      paragraphs: [
        `${n + 2}.1 This Agreement sets out the entire agreement between the parties on the Employment. Any change shall be in writing and signed by both parties, save for changes required by law; the Employee shall be informed in writing of any change at the latest on the day it takes effect.`,
        `${n + 2}.2 If any provision is held invalid, the remaining provisions continue in force.`,
        `${n + 2}.3 This Agreement is provided and signed electronically. The Employee can store and print it and may ask for a paper copy at any time. Electronic signatures have the same effect as handwritten signatures under the Electronic Commerce Act (Cap. 426).`,
      ],
    },
    {
      heading: `${n + 3}. Governing Law`,
      paragraphs: [
        `${n + 3}.1 This Agreement is governed by the laws of Malta. The parties shall try to settle any dispute amicably; otherwise it shall be referred to the Industrial Tribunal or the competent courts of Malta.`,
      ],
    }
  );

  const gender = f.employee.gender
    ? `, ${f.employee.gender.toLowerCase()},`
    : "";
  return {
    title: "CONTRACT OF EMPLOYMENT",
    parties: [
      `This Agreement is made on ${longDate(f.date)}.`,
      `BETWEEN ${company}, a company incorporated under the laws of Malta with registration number ${blank(f.employer.regNo)}, having its registered office at ${blank(f.employer.address)} (the "Company");`,
      `AND ${blank(f.employee.name)}${gender} of ${blank(f.employee.nationality)} nationality, holder of ${f.employee.idLabel} number ${blank(f.employee.idNumber)}, residing at ${blank(f.employee.address)} (the "Employee").`,
    ],
    sections,
  };
}

/** Canonical text of a contract (what is hashed, stored and signed). */
export function contractText(c: ContractDoc) {
  return [
    c.title,
    "",
    ...c.parties,
    "",
    ...c.sections.flatMap((s) => [s.heading, ...s.paragraphs, ""]),
  ].join("\n");
}

const HEADING = /^\d+\. \S/;

/**
 * Splits a stored contract text back into lines for display and PDF, so a
 * signed contract always shows exactly the text that was signed, even
 * after the template changes.
 */
export function textBlocks(text: string) {
  const [title = "", ...rest] = text.split("\n");
  return {
    title,
    lines: rest
      .filter((l) => l.trim())
      .map((l) => ({ text: l, heading: HEADING.test(l) })),
  };
}

/** SHA-256 (hex) of a text, in the browser or the Convex runtime. */
export async function sha256Hex(text: string) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(text)
  );
  return [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
