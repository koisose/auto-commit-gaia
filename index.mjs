#!/usr/bin/env node
import { execSync, spawn } from "child_process";
import { confirm, select } from '@clack/prompts';
import ky from 'ky';




const systemMessageEnglishOnly = `You are a commit message generator create a commit message in english by their diff string, 
you don't need to explain anything just put the commit message, this is the schema:

---
<emoji> <type>(<scope>): <subject>
<body>
---

With allowed <type> values are feat, fix, perf, docs, style, refactor, test, and build. And here's an example of a good commit message:

---
📝 docs(README): Add web demo and Clarifai project.
Adding links to the web demo and Clarifai project page to the documentation. Users can now access the GPT-4 Turbo demo application and view the Clarifai project through the provided links.
---`;
async function gitAdd() {
  const child = spawn("git", ["add", "."]);
  await new Promise((resolve, reject) => {
    child.on("close", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`Git command failed with exit code ${code}`));
      }
    });
    child.stderr.on("data", (data) => {
      if (data.toString().includes('nothing to commit')) {
        reject(new Error('Nothing to commit'));
      }
      console.error(data.toString());
    });
  });
}
async function readFirstFileDiff(fileName) {
  const child = spawn("git", ["diff", "--staged", fileName]);
  const diffOutput = await new Promise((resolve, reject) => {
    let stdout = "";
    child.stdout.on("data", (data) => {
      stdout += data.toString();
    });
    child.on("close", (code) => {
      if (code === 0) {
        resolve(stdout);
      } else {
        reject(new Error(`Git command failed with exit code ${code}`));
      }
    });
    child.stderr.on("data", (data) => {
      console.error(data.toString());
    });
  });
  return diffOutput;
}
async function gitDiffStaged() {
  const child = spawn("git", ["diff", "--staged", "--name-only", "--diff-filter=d"]);
  const output = await new Promise((resolve, reject) => {
    let stdout = "";
    child.stdout.on("data", (data) => {
      stdout += data.toString();
    });
    child.on("close", (code) => {
      if (code === 0) {
        resolve(stdout);
      } else {
        reject(new Error(`aGit command failed with exit code ${code}`));
      }
    });
    child.stderr.on("data", (data) => {
      console.error(data.toString());
    });
  });

  const files = output.trim().split('\n');
  return files

}
async function randomNode() {
  const response = await ky.get('https://api.gaianet.ai/api/v1/network/nodes/');
  const data = await response.json();
  const objectArray = data.data.objects.filter(obj => obj.status === 'ONLINE' && obj.model_name && obj.model_name.toLowerCase().includes('llama'));
  const random = objectArray[Math.floor(Math.random() * objectArray.length)];
  return random
}
function decodeEscapedCharacters(str) {
  return str.replace(/\\n/g, '\n')
            .replace(/\\t/g, '\t')
            .replace(/\\r/g, '\r')
            .replace(/\\b/g, '\b')
            .replace(/\\f/g, '\f')
            .replace(/\\\\/g, '\\')
            .replace(/\\"/g, '"')
            .replace(/\\'/g, "'");
}
async function bo(diffString) {
  const random = await randomNode();

  const response = await ky.post(`https://${random.subdomain}/v1/chat/completions`, {
    json: {
      "messages": [
        {
          role: "system",
          content: systemMessageEnglishOnly
        },
        {
          role: 'user', content: `diff --git a/bun.lockb b/bun.lockb
        new file mode 100755
        index 0000000..7a2303c
        Binary files /dev/null and b/bun.lockb differ
        ` },
        {
          role: "assistant",
          content: "🌍feat(bun.lockb): Bun integration\nOur bun is now integrated into our project. This commit adds the ability to use a bun in our project.\n---\n\n\n"
        },
        {
          role: "user",
          content: diffString
        }
      ],
      "model": random.model_name
    }, retry: {
      limit: 3,
      methods: ['post'],
      statusCodes: [408, 504],
      backoffLimit: 3000
    },
    timeout: 50000
  });
  const a = await response.json()
  return a
}

async function run() {


  try {
    await gitAdd()
    const diffString = await gitDiffStaged();
    if (diffString.length === 0) {
      execSync(`git reset`);
      console.log("No changes to commit");
      process.exit()
    }
    const fileName = await select({
      message: 'Pick which file to create commit message from:',
      options: diffString.map(a => ({ value: a, label: a }))
    });

    const diff = await readFirstFileDiff(fileName)
    const completion = await bo(diff)   

    const text = completion.choices[0]?.message?.content || "";
    let text1=decodeEscapedCharacters(text)
    let text2 = text1.replace(/```/g, '');
    let text3 = text2.replace(/---/g, '')
    let text4 = text3.replace(/\"/gi, "\\\"")
    let text5 = text4.replace(/\`/gi, "\\`");
    let text6 = text5.replace(/\'/gi, "\\'");

    console.log(text6.trim())
    const stop = await confirm({
      message: 'stop?'
    });
    if (stop) {
      execSync(`git reset`);
      process.exit();
    }
    const commitOnly = await confirm({
      message: 'commit only?'
    });
    if (commitOnly) {
      execSync(`git add -A`);
      execSync(`printf "${text6.trim()}" | git commit -F-`);
      process.exit();
    }
    const shouldContinue = await confirm({
      message: 'Do you want to push?',
    });
    if (shouldContinue) {
      execSync(`printf "${text6}" | git commit -F-`);
      execSync("git push -u origin main");
    } else {
      execSync(`git reset`);
    }

    process.exit();
  } catch (e) {
    console.log(e.message);
    execSync(`git reset`);
    process.exit();
  }
}
run()