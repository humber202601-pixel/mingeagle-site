import {writeFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
const revision=process.env.CF_PAGES_COMMIT_SHA||process.env.GITHUB_SHA||execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
if(!/^[a-f0-9]{40}$/.test(revision))throw new Error('Missing exact deployment revision');
writeFileSync('dist/deployment-version.json',JSON.stringify({revision,builtAt:new Date().toISOString(),component:'mingeagle-crm'})+'\n');
