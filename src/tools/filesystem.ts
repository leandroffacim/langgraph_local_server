// tools/filesystem.ts
import { tool } from "@langchain/core/tools";
import * as fs from "fs/promises";
import * as path from "path";
import { z } from "zod";

const OUTPUT_DIR = "../output"; // diretório onde os arquivos serão criados

export const writeFileTool = tool(
    async ({ filePath, content }) => {
        const fullPath = path.join(OUTPUT_DIR, filePath);

        // Cria diretórios intermediários se necessário
        await fs.mkdir(path.dirname(fullPath), { recursive: true });
        await fs.writeFile(fullPath, content, "utf-8");

        console.log(`[writeFile] Created: ${fullPath}`);
        return `File created successfully: ${filePath}`;
    },
    {
        name: "write_file",
        description:
            "Write content to a file. Use this to implement code files.",
        schema: z.object({
            filePath: z
                .string()
                .describe(
                    "Relative path of the file, e.g. 'src/utils/debounce.ts'",
                ),
            content: z.string().describe("Complete file content to write"),
        }),
    },
);

export const readFileTool = tool(
    async ({ filePath }) => {
        const fullPath = path.join(OUTPUT_DIR, filePath);
        const content = await fs.readFile(fullPath, "utf-8");
        return content;
    },
    {
        name: "read_file",
        description: "Read the content of an existing file.",
        schema: z.object({
            filePath: z.string().describe("Relative path of the file to read"),
        }),
    },
);

export const listFilesTool = tool(
    async ({ dir }) => {
        const fullPath = path.join(OUTPUT_DIR, dir ?? "");
        const entries = await fs.readdir(fullPath, { withFileTypes: true });
        return entries
            .map((e) => `${e.isDirectory() ? "[dir]" : "[file]"} ${e.name}`)
            .join("\n");
    },
    {
        name: "list_files",
        description: "List files in a directory.",
        schema: z.object({
            dir: z
                .string()
                .optional()
                .describe("Subdirectory to list (optional)"),
        }),
    },
);
