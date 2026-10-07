import fs from 'node:fs';

// Fix the school-discovery D1 INSERT placeholder count before Cloudflare builds Functions.
const schoolPath = 'functions/api/admin/discovery-school-v1.ts';
let school = fs.readFileSync(schoolPath, 'utf8');
const badSql = `VALUES (?,?, 'GEOAPIFY_SCHOOL_V1',?,?,?,?,?,?,?,?,?,?,?,?, 'NEW',?,?,?,?,?,?,?,'COMPLETED',?,CURRENT_TIMESTAMP)`;
const goodSql = `VALUES (?,?, 'GEOAPIFY_SCHOOL_V1',?,?,?,?,?,?,?,?,?,?,?,?, 'NEW',?,?,?,?,?,?,'COMPLETED',?,CURRENT_TIMESTAMP)`;
if (school.includes(badSql)) {
  school = school.replace(badSql, goodSql);
} else if (!school.includes(goodSql)) {
  throw new Error('School discovery SQL marker changed; refusing blind patch.');
}
fs.writeFileSync(schoolPath, school, 'utf8');

// Extend the generic "官网补全" button so school candidates keep looking at the right public pages and job titles.
const enrichPath = 'functions/api/admin/discovery-enrich-v2.ts';
let enrich = fs.readFileSync(enrichPath, 'utf8');
const oldRoles = `const roles='Owner|Founder|Co-Founder|Executive Director|Program Director|Basketball Director|Training Director|Head Coach|General Manager|Operations Director|Purchasing Manager|Procurement Manager|Director|Coach|Manager|President|CEO';`;
const newRoles = `const roles='Owner|Founder|Co-Founder|Executive Director|Program Director|Basketball Director|Training Director|Head Coach|General Manager|Operations Director|Athletic Director|Director of Athletics|PE Teacher|Physical Education Teacher|Physical Education Director|Sports Coordinator|Athletic Coordinator|Activities Director|Recreation Director|Purchasing Manager|Procurement Manager|Procurement Officer|Purchasing Director|Buyer|Operations Manager|School Administrator|Business Manager|Principal|Vice Principal|Head of School|Director|Coach|Manager|President|CEO';`;
if (enrich.includes(oldRoles)) enrich = enrich.replace(oldRoles, newRoles);
else if (!enrich.includes('Athletic Director|Director of Athletics|PE Teacher')) throw new Error('Enrichment role marker changed; refusing blind patch.');

const oldPreferred = `/\\/(contact|contact-us|about|about-us|team|staff|coaches|coach|leadership|our-team)(?:[/?#]|$)/i`;
const newPreferred = `/\\/(contact|contact-us|about|about-us|team|staff|directory|coaches|coach|leadership|our-team|athletics|athletic|physical-education|pe|purchasing|procurement|vendors?|business-office|administration)(?:[/?#]|$)/i`;
if (enrich.includes(oldPreferred)) enrich = enrich.replace(oldPreferred, newPreferred);
else if (!enrich.includes('physical-education|pe|purchasing|procurement')) throw new Error('Enrichment preferred-link marker changed; refusing blind patch.');

fs.writeFileSync(enrichPath, enrich, 'utf8');

console.log('School procurement SQL + enrichment safeguards applied.');
