import { exec } from "child_process";
import { name as pkgName, version as pkgVersion } from "../package.json";
import readline from "readline";
// Create an interface for input and output
const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
});

const askQuestion = (question: string) => {
    return new Promise((resolve) => {
        rl.question(question, (answer) => {
            resolve(answer);
        });
    });
};

function run(cmd: string): string | null {

    let output : string | null = null;
    exec(cmd, (error, stdout, stderr) => {
        if (error) {
            // console.error(`Error: ${error.message}`);
            // return;
        }
        if (stderr) {
            // console.error(`Stderr: ${stderr}`);
            // return;
        }
        console.log(`Stdout:${stdout}`);
        output = stdout;
    });
    return output;
}

const main = async () => {
    exec(`npm show ${pkgName} version --json`, async (error, stdout, stderr) => {
        if (error) {
            console.error(`Error: ${error.message}`);
            // return;
        }
        if (stderr) {
            console.error(`Stderr: ${stderr}`);
            // return;
        }
        console.log(`package version at npm: ${stdout}`);
        console.log(`package version at local: "${pkgVersion}"`);
        let npmVersion = stdout;
        if (!npmVersion || npmVersion.length < 1) {
            console.error( "Invalid npm package version");
            return;
        }

        if (npmVersion === pkgVersion) {
            console.error( "Local package version is similar to npm package version");
            return;
        }

        const name: string | unknown = await askQuestion(`Publish ${pkgName} to npm? [y/N] `);
        if (typeof name === "string" && name.toLowerCase().startsWith("y")) {
            run("npm publish --access public");
        }
        rl.close();
    });
};

main().then(_=> null);
