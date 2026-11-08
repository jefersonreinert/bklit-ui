/**
 * Contract of employment (Malta) built from the HR file. It covers the
 * information an employer must give in writing under the Employment and
 * Industrial Relations Act (Cap. 452) and the Transparent and Predictable
 * Working Conditions Regulations (S.L. 452.126): parties, place of work,
 * role, start (and end) date, probation, pay, hours, overtime, leave,
 * notice, social security and, for third-country nationals, the permit.
 * Template to be reviewed once by a Maltese lawyer or accountant.
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
}

export interface ContractDoc {
  title: string;
  parties: string[];
  sections: { heading: string; paragraphs: string[] }[];
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
    : `€${n.toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

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

export function buildContract(f: ContractFields): ContractDoc {
  const company = blank(f.employer.name);
  const pay =
    f.payType === "monthly"
      ? `The Employee shall be paid a gross salary of ${eur(f.monthlySalary)} per month, payable monthly in arrears by bank transfer at the end of each calendar month.`
      : `The Employee shall be paid a gross wage of ${eur(f.hourlyRate)} per hour worked, payable monthly in arrears by bank transfer at the end of each calendar month, on the basis of the hours recorded in the Company's time-keeping system.`;
  const term = f.endDate
    ? `The Employment shall commence on ${longDate(f.startDate)} (the "Effective Date") and is for a definite term ending on ${longDate(f.endDate)}, unless terminated earlier in accordance with this Agreement and the law.`
    : `The Employment shall commence on ${longDate(f.startDate)} (the "Effective Date") and is for an indefinite period, subject to termination in accordance with this Agreement and the law.`;

  const sections: ContractDoc["sections"] = [
    {
      heading: "1. Appointment and Duration",
      paragraphs: [
        `1.1 The Company employs the Employee as ${blank(f.jobTitle)}, and the Employee agrees to work for the Company under the terms of this Agreement.`,
        `1.2 ${term}`,
        `1.3 The first ${months(f.probationMonths)} of the Employment shall be a probationary period, during which either party may terminate the Employment in accordance with the Employment and Industrial Relations Act (Cap. 452 of the Laws of Malta).`,
      ],
    },
    {
      heading: "2. Duties",
      paragraphs: [
        `2.1 The Employee shall perform the duties normally associated with the role of ${blank(f.jobTitle)}, together with such other reasonable duties, consistent with the Employee's skills, as the Company may assign from time to time.`,
        "2.2 The Employee shall comply with all reasonable and lawful instructions of the Company and with its policies on hygiene, food safety, health and safety, responsible service of alcohol and conduct towards customers and colleagues.",
      ],
    },
    {
      heading: "3. Place of Work",
      paragraphs: [
        `3.1 The Employee's normal place of work is ${blank(f.workplace.name)}, ${blank(f.workplace.address)}. The Company may require the Employee to work at its other outlets in Malta where the needs of the business so require, after giving reasonable notice.`,
      ],
    },
    {
      heading: "4. Hours of Work",
      paragraphs: [
        `4.1 The Employee's normal working week is ${f.weeklyHours} hours, arranged in shifts according to the roster published by the Company, which may include evenings, weekends and public holidays as is usual in the hospitality sector.`,
        `4.2 Overtime shall only be worked with the prior approval of the Employee's manager and shall be paid at ${f.overtime} times the Employee's normal hourly rate, or as otherwise provided by the applicable Wage Regulation Order for the hotel and catering sector (S.L. 452.19), whichever is more favourable to the Employee.`,
        "4.3 Rest periods, breaks and the maximum average working week shall be in accordance with the Organisation of Working Time Regulations (S.L. 452.87). The Employee may agree in writing to work more than an average of forty-eight (48) hours per week and may withdraw such agreement by giving written notice as provided by law.",
      ],
    },
    {
      heading: "5. Remuneration",
      paragraphs: [
        `5.1 ${pay}`,
        "5.2 In addition, the Employee shall receive the statutory bonuses and weekly allowance, and any cost-of-living increases, as prescribed by law from time to time.",
        "5.3 Work on Sundays and public holidays shall be compensated in accordance with the applicable Wage Regulation Order and the law.",
        "5.4 All payments are subject to the deduction of income tax and social security contributions as required by law. The Company shall pay its own social security contributions to the Department of Social Security. No deductions shall be made from the Employee's wages other than those permitted by law or agreed in writing by the Employee in accordance with the law.",
      ],
    },
    {
      heading: "6. Leave",
      paragraphs: [
        "6.1 The Employee is entitled to paid annual leave and to all public holidays recognised in Malta, as prescribed by Maltese law, calculated pro rata for any part of the year worked.",
        "6.2 Annual leave shall be taken at times agreed with the Company, having regard to the needs of the business. Up to five (5) days of unused leave may be carried forward to the following year with the Company's written consent.",
        "6.3 Upon termination, the Employee shall be paid for all accrued but untaken annual leave.",
      ],
    },
    {
      heading: "7. Sickness and Injury",
      paragraphs: [
        "7.1 The Employee is entitled to sick leave in accordance with the law. The Employee shall inform the manager on duty as soon as possible on the first day of absence.",
        "7.2 For absences of more than two (2) consecutive days, the Employee shall provide a medical certificate issued by a registered medical practitioner. The Company may, at its expense, request a medical examination to verify an absence.",
      ],
    },
    {
      heading: "8. Confidentiality and Data Protection",
      paragraphs: [
        "8.1 The Employee shall not, during or after the Employment, disclose or use for any purpose other than the Employment any confidential information of the Company, including information about its customers, suppliers, recipes, prices, takings and staff.",
        "8.2 The Company processes the Employee's personal data for the purposes of the Employment and to comply with its legal obligations, in accordance with the General Data Protection Regulation (EU) 2016/679 and the Data Protection Act (Cap. 586).",
      ],
    },
    {
      heading: "9. Termination",
      paragraphs: [
        "9.1 After the probationary period, either party may terminate the Employment by giving the period of notice established by article 36 of the Employment and Industrial Relations Act (Cap. 452), according to the Employee's length of service.",
        "9.2 The Company may terminate the Employment without notice for a good and sufficient cause as defined by law, including gross misconduct, theft, dishonesty, serious breach of this Agreement or of health and safety rules, or working under the influence of alcohol or drugs.",
        "9.3 Notice shall be given in writing. Upon termination the Employee shall return all property of the Company, including keys, uniforms and access cards.",
      ],
    },
  ];

  if (f.origin === "non-eu") {
    sections.push({
      heading: "10. Work and Residence Permit",
      paragraphs: [
        "10.1 The Employee is a third-country national. This Employment is conditional upon the Employee holding at all times a valid Single Permit (or other permit) entitling the Employee to reside and work in Malta for the Company in this role.",
        "10.2 The Company shall apply for the necessary permit and its renewals and shall bear the related application costs. Any reimbursement by the Employee shall be agreed in writing, shall comply with Maltese law and shall not constitute an unlawful deduction from wages.",
        "10.3 The Employee shall promptly provide all documents required for the permit, including the Pre-Departure Course certificate and the Tourism and Hospitality Skills Pass where applicable, and shall inform the Company immediately of any change in immigration status.",
        "10.4 If the permit expires, is refused or is revoked, and cannot lawfully be renewed, the Employment shall terminate in accordance with the law.",
      ],
    });
  }

  const n = sections.length + 1;
  sections.push(
    {
      heading: `${n}. Social Security`,
      paragraphs: [
        `${n}.1 The Employee shall be insured with the Department of Social Security of Malta, and contributions shall be paid by the Company and the Employee as required by the Social Security Act (Cap. 318).`,
      ],
    },
    {
      heading: `${n + 1}. Entire Agreement and Variation`,
      paragraphs: [
        `${n + 1}.1 This Agreement sets out the entire agreement between the parties and supersedes any prior arrangement relating to the Employment. Any variation shall be in writing and signed by both parties, save for changes required by law.`,
        `${n + 1}.2 If any provision of this Agreement is held invalid, the remaining provisions shall continue in full force.`,
      ],
    },
    {
      heading: `${n + 2}. Governing Law`,
      paragraphs: [
        `${n + 2}.1 This Agreement is governed by the laws of Malta. Disputes shall first be settled amicably and otherwise referred to the Industrial Tribunal or the competent courts of Malta.`,
        `${n + 2}.2 The parties agree that this Agreement may be signed by electronic signature, which shall have the same effect as a handwritten signature in terms of the Electronic Commerce Act (Cap. 426).`,
      ],
    }
  );

  return {
    title: "CONTRACT OF EMPLOYMENT",
    parties: [
      `This Agreement is made on ${longDate(f.date)}.`,
      `BETWEEN ${company}, a company incorporated under the laws of Malta with registration number ${blank(f.employer.regNo)}, having its registered office at ${blank(f.employer.address)} (the "Company");`,
      `AND ${blank(f.employee.name)}, of ${blank(f.employee.nationality)} nationality, holder of ${f.employee.idLabel} number ${blank(f.employee.idNumber)}, residing at ${blank(f.employee.address)} (the "Employee").`,
    ],
    sections,
  };
}

/** Canonical text of a contract (what is hashed and signed). */
export function contractText(c: ContractDoc) {
  return [
    c.title,
    "",
    ...c.parties,
    "",
    ...c.sections.flatMap((s) => [s.heading, ...s.paragraphs, ""]),
  ].join("\n");
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
