import { Uri } from "vscode";
import { BruinInternalParse } from "../../bruin/bruinInternalParse";
import { bruinWorkspaceDirectory } from "../../bruin/bruinUtils";
import { getBruinExecutablePath } from "../../providers/BruinExecutableService";

export const parseAssetColumnsCommand = async (documentUri: Uri): Promise<void> => {
  const workspaceFolder = await bruinWorkspaceDirectory(documentUri.fsPath);
  if (!workspaceFolder) {
    console.error("No workspace folder found.");
    return;
  }

  const bruinInternalParse = new BruinInternalParse(getBruinExecutablePath(), workspaceFolder);
  await bruinInternalParse.parseColumns(documentUri.fsPath);
};