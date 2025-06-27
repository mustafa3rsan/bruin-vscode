import * as vscode from 'vscode';

interface FavoriteSchema {
  connectionName: string;
  schemaName: string;
  connectionType?: string;
}

class FavoriteItem extends vscode.TreeItem {
  constructor(
    public readonly label: string,
    public readonly collapsibleState: vscode.TreeItemCollapsibleState,
    public readonly favoriteData: FavoriteSchema,
    public readonly contextValue: 'favorite-schema'
  ) {
    super(label, collapsibleState);
    this.contextValue = contextValue;
    this.iconPath = new vscode.ThemeIcon('star-full');
    this.tooltip = `${favoriteData.connectionName}.${favoriteData.schemaName}`;
  }
}

export class FavoritesProvider implements vscode.TreeDataProvider<FavoriteItem> {
  private _onDidChangeTreeData: vscode.EventEmitter<FavoriteItem | undefined | null | void> = new vscode.EventEmitter<FavoriteItem | undefined | null | void>();
  readonly onDidChangeTreeData: vscode.Event<FavoriteItem | undefined | null | void> = this._onDidChangeTreeData.event;

  private favorites = new Map<string, FavoriteSchema>();

  constructor() {
    this.loadFavorites();
    
    // Listen for configuration changes
    vscode.workspace.onDidChangeConfiguration((event) => {
      if (event.affectsConfiguration('bruin.favoriteSchemas')) {
        this.loadFavorites();
      }
    });
  }

  public refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  public addFavorite(connectionName: string, schemaName: string, connectionType?: string): void {
    const key = `${connectionName}.${schemaName}`;
    this.favorites.set(key, {
      connectionName,
      schemaName,
      connectionType
    });
    this.saveFavorites();
    this._onDidChangeTreeData.fire();
  }

  public removeFavorite(connectionName: string, schemaName: string): void {
    const key = `${connectionName}.${schemaName}`;
    this.favorites.delete(key);
    this.saveFavorites();
    this._onDidChangeTreeData.fire();
  }

  public isFavorite(connectionName: string, schemaName: string): boolean {
    const key = `${connectionName}.${schemaName}`;
    return this.favorites.has(key);
  }

  public toggleFavorite(connectionName: string, schemaName: string, connectionType?: string): void {
    if (this.isFavorite(connectionName, schemaName)) {
      this.removeFavorite(connectionName, schemaName);
    } else {
      this.addFavorite(connectionName, schemaName, connectionType);
    }
  }

  getTreeItem(element: FavoriteItem): vscode.TreeItem {
    return element;
  }

  async getChildren(element?: FavoriteItem): Promise<FavoriteItem[]> {
    if (!element) {
      // Root level - return all favorites
      return Array.from(this.favorites.values()).map(favorite => {
        const displayLabel = `${favorite.connectionName}.${favorite.schemaName}`;
        return new FavoriteItem(
          displayLabel,
          vscode.TreeItemCollapsibleState.None,
          favorite,
          'favorite-schema'
        );
      });
    }
    return [];
  }

  private async loadFavorites(): Promise<void> {
    try {
      const config = vscode.workspace.getConfiguration('bruin');
      const favoriteSchemas = config.get<{[key: string]: FavoriteSchema}>('favoriteSchemas', {});
      
      this.favorites.clear();
      
      // Clean up and validate favorite schemas
      Object.entries(favoriteSchemas).forEach(([key, favorite]) => {
        // Check if favorite data is valid
        if (favorite && 
            typeof favorite === 'object' && 
            favorite.connectionName && 
            favorite.schemaName &&
            typeof favorite.connectionName === 'string' &&
            typeof favorite.schemaName === 'string') {
          
          // Create proper key if it doesn't match
          const properKey = `${favorite.connectionName}.${favorite.schemaName}`;
          this.favorites.set(properKey, favorite);
        } else {
          console.warn(`Invalid favorite schema entry: ${key}`, favorite);
        }
      });
      
      // Save cleaned favorites back to settings if any cleanup was needed
      if (Object.keys(favoriteSchemas).length !== this.favorites.size) {
        await this.saveFavorites();
      }
      
      this._onDidChangeTreeData.fire();
    } catch (error) {
      console.error('Error loading favorites from settings:', error);
      // Reset favorites on error
      this.favorites.clear();
      await this.saveFavorites();
    }
  }

  private async saveFavorites(): Promise<void> {
    try {
      const config = vscode.workspace.getConfiguration('bruin');
      const favoriteSchemas = Object.fromEntries(this.favorites);
      
      await config.update('favoriteSchemas', favoriteSchemas, vscode.ConfigurationTarget.Workspace);
    } catch (error) {
      console.error('Error saving favorites to settings:', error);
    }
  }
} 