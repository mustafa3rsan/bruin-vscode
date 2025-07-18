import { BruinCommand } from "./bruinCommand";

export class BruinEnvironments extends BruinCommand {
  protected bruinCommand(): string {
    return "environments";
  }

  public async create(environment: string): Promise<string> {
    const flags = ["create", "--name", environment, "-o", "json"];
    return this.run(flags);
  }

  public async delete(environment: string): Promise<string> {
    const flags = ["delete", "--force", "--name", environment, "-o", "json"];
    return this.run(flags);
  }

  public async update(currentName: string, newName: string): Promise<string> {
    const flags = ["update", "--name", currentName, "--new-name", newName, "-o", "json"];
    return this.run(flags);
  }
}

