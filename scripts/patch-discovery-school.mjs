import fs from 'node:fs';

const path = 'src/DiscoveryCenter.tsx';
let text = fs.readFileSync(path, 'utf8');

const oldTypes = `const TYPE_OPTIONS = [
  ['BASKETBALL_TRAINING','篮球训练机构 / Academy'],
  ['BASKETBALL_GYM','篮球馆 / Sports Center'],
  ['YOUTH_CLUB','青少年体育俱乐部'],
  ['SPORTS_STORE','体育用品零售商'],
] as const;`;

const newTypes = `const TYPE_OPTIONS = [
  ['BASKETBALL_TRAINING','篮球训练机构 / Academy'],
  ['BASKETBALL_GYM','篮球馆 / Sports Center'],
  ['YOUTH_CLUB','青少年体育俱乐部'],
  ['SPORTS_STORE','体育用品零售商'],
  ['PRESCHOOL_KINDERGARTEN','幼儿园 / Preschool / Kindergarten'],
  ['ELEMENTARY_SCHOOL','小学 / Elementary School'],
  ['MIDDLE_HIGH_SCHOOL','初高中 / Middle & High School'],
  ['PRIVATE_CHARTER_SCHOOL','私立 / Charter School'],
  ['SCHOOL_DISTRICT','学区 / School District'],
  ['AFTER_SCHOOL_PROGRAM','课后项目 / Youth Activity Program'],
  ['EDUCATION_SUPPLIER','学校体育用品供应商 / Education Supplier'],
] as const;`;

if (!text.includes("['PRESCHOOL_KINDERGARTEN'")) {
  if (!text.includes(oldTypes)) throw new Error('DiscoveryCenter TYPE_OPTIONS marker changed; refusing blind patch.');
  text = text.replace(oldTypes, newTypes);
}

text = text.replace(
  `if (value.startsWith('GEOAPIFY')) return 'Geoapify地点';`,
  `if (value.startsWith('GEOAPIFY_SCHOOL')) return '学校/采购验证';\n  if (value.startsWith('GEOAPIFY')) return 'Geoapify地点';`
);

text = text.replace(
  'Geoapify 免费地点发现 + 官网公开资料补全',
  '商业客户 + 学校/学区/PE/采购联系人发现'
);

text = text.replace(
  '第一层用 Geoapify 免费配额与 Web 官网验证发现真实商业客户；第二层补全 Contact / About / Team / Coach 等公开页面，再进入 CRM 销售流程。',
  '支持训练机构、体育零售以及幼儿园、小学、初高中、学区、课后项目和学校体育用品供应商。学校模式会优先检查 Staff / Athletics / PE / Purchasing / Procurement / Vendor 等公开页面，再进入 CRM 销售流程。'
);

fs.writeFileSync(path, text, 'utf8');
console.log('School procurement discovery UI patch applied.');
