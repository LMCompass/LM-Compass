import { readFile } from "fs/promises";
import { join } from "path";
import CreateRubricForm from "./create-rubric-form";

export default async function CreateRubricPage() {
  // Read the default description from the file
  const filePath = join(process.cwd(), "app", "rubric", "types", "prompt_based.txt");
  const defaultDescription = await readFile(filePath, "utf-8");

  return <CreateRubricForm defaultDescription={defaultDescription} />;
}
