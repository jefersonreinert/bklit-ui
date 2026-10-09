// Big sites that never allow being shown inside another app (and may
// answer servers with a captcha page instead of their real headers)
export const NEVER_EMBED =
  /(^|\.)(google\.[a-z.]+|youtube\.com|instagram\.com|facebook\.com|whatsapp\.com|x\.com|twitter\.com|linkedin\.com|tiktok\.com|booking\.com|amazon\.[a-z.]+|apple\.com|microsoft\.com|live\.com|github\.com|claude\.ai|uber\.com|ubereats\.com|netflix\.com|paypal\.com|thefork\.[a-z.]+)$/i;
