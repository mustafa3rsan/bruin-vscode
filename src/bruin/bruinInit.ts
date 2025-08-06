import * as vscode from "vscode";
import { BRUIN_INIT_COMMAND } from "../constants";
import { createIntegratedTerminal } from "./bruinUtils";
import { getBruinExecutablePath } from "../providers/BruinExecutableService";

/**
 * Runs the 'bruin init' command in an integrated terminal to create a new Bruin project.
 * This command initializes a new Bruin project in the current workspace directory.
 * 
 * @param workingDir - The directory where the bruin init command should be executed
 * @returns Promise<void>
 */
export const runBruinInit = async (workingDir?: string): Promise<void> => {
  const terminal = await createIntegratedTerminal(workingDir);
  const bruinExecutable = getBruinExecutablePath();
  
  const executable = ((terminal.creationOptions as vscode.TerminalOptions).shellPath?.includes("bash")) 
    ? "bruin" 
    : bruinExecutable;
  
  const command = `${executable} ${BRUIN_INIT_COMMAND}`;
  
  terminal.show(true);
  terminal.sendText(" ");
  
  setTimeout(() => {
    terminal.sendText(command);
  }, 500);
  
  await new Promise((resolve) => setTimeout(resolve, 1000));
};