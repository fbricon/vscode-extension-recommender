import { TelemetryService } from "@redhat-developer/vscode-redhat-telemetry/lib";
import path from "path";
import { ExtensionContext, commands } from "vscode";
import { Recommendation, RecommendationModel, UserChoice } from "../recommendationModel";
import { IRecommendationService } from "../recommendationService";
import { IStorageService } from "../storageService";
import { StorageServiceImpl } from "./storageServiceImpl";
import { getInstalledExtensionName, isExtensionInstalled, promptUserUtil, installExtensionUtil } from "./vscodeUtil";

export const filterUnique = (value: any, index: number, self: any[]): boolean => self.indexOf(value) === index;

/**
* Command string to render markdown string to html string
*/
export const COMMAND_MARKDOWN_API_RENDER = 'markdown.api.render';

export class RecommendationServiceImpl implements IRecommendationService {
    private storageService: IStorageService;
    private extensionContext: ExtensionContext;
    private telemetryService: TelemetryService | undefined;
    constructor(context: ExtensionContext, telemetryService?: TelemetryService) {
        this.extensionContext = context;
        this.telemetryService = telemetryService;
        const storagePath = this.getRecommendationWorkingDir(context);
        this.storageService = new StorageServiceImpl(storagePath);
    }

    private getRecommendationWorkingDir(context: ExtensionContext): string {
        return path.resolve(context.globalStorageUri.fsPath, '..', 'vscode-extension-recommender');
    }

    public async register(toAdd: Recommendation[]): Promise<void> {
        const newSession: boolean = await this.addRecommendationsToModel(toAdd);
        if( newSession ) {
            // Return fast (ie, don't await) so as not to slow down caller
            this.showStartupRecommendations();
        }
    }

    public create(extensionId: string, 
        extensionDisplayName: string,
        description: string, 
        shouldShowOnStartup: boolean): Recommendation {
            return {
                sourceId: this.extensionContext.extension.id,
                extensionId: extensionId, 
                extensionDisplayName: extensionDisplayName,
                description: description, 
                shouldShowOnStartup: shouldShowOnStartup,
                timestamp: Date.now(),
                userIgnored: false
            };
        }


    public async addRecommendationsToModel(toAdd: Recommendation[]): Promise<boolean> {
        const newSession = await this.storageService.runWithLock(async (model: RecommendationModel): Promise<RecommendationModel> => {
            const current: Recommendation[] = model.recommendations;
            const newRecs: Recommendation[] = [];
            const toAddAlreadyAdded: Recommendation[] = [];
            for( let i = 0; i < current.length; i++ ) {
                const beingAdded = this.findRecommendation(current[i].sourceId, current[i].extensionId, toAdd);
                if( beingAdded ) {
                    beingAdded.userIgnored = current[i].userIgnored;
                    newRecs.push(beingAdded);
                    toAddAlreadyAdded.push(beingAdded);
                } else {
                    newRecs.push(current[i]);
                }
            }

            for( let i = 0; i < toAdd.length; i++ ) {
                if( !toAddAlreadyAdded.includes(toAdd[i])) {
                    newRecs.push(toAdd[i]);
                }
            }
            
            model.recommendations = newRecs;
            return model;
        });
        return newSession;
    }

    private findRecommendation(needleFrom: string, needleTo: string, haystack: Recommendation[]): Recommendation | undefined {
        for( let i = 0; i < haystack.length; i++ ) {
            if( haystack[i].sourceId === needleFrom && 
                haystack[i].extensionId === needleTo ) {
                return haystack[i];
            }
        }
        return undefined;
    }
    
    public async show(fromExtension: string, toExtension: string, overrideDescription?: string): Promise<void> {
        // Show a single recommendation immediately
        if(isExtensionInstalled(fromExtension) && !isExtensionInstalled(toExtension)) {
            const model: RecommendationModel|undefined = await this.storageService.readRecommendationModel();
            if( model ) {
                const rec: Recommendation | undefined = model.recommendations.find((x) => x.extensionId === toExtension && x.sourceId === fromExtension);
                if( rec ) {
                    const displayName = rec.extensionDisplayName || rec.extensionId;
                    const recToUse: Recommendation = {...rec};
                    if( overrideDescription ) {
                        recToUse.description = overrideDescription;
                    }
                    const msg = this.collectMessage(toExtension, displayName, [recToUse]);
                    this.displaySingleRecommendation(toExtension, displayName, 1, msg);
                }
            }
        }
    }

    public async showStartupRecommendations(): Promise<void> {
        // wait 6 seconds for other tools to start up
        await new Promise(resolve => setTimeout(resolve, 6000));
        // Then show the dialogs
        const model: RecommendationModel|undefined = await this.storageService.readRecommendationModel();        
        if( model ) {
            const recommendedExtension: string[] = model.recommendations
                .map((x) => x.extensionId)
                .filter(filterUnique)
                .filter((x) => !isExtensionInstalled(x));
            for( let i = 0; i < recommendedExtension.length; i++ ) {
                this.showStartupRecommendationsForSingleExtension(model, recommendedExtension[i]);
            }
        }
    }

    private async showStartupRecommendationsForSingleExtension( model: RecommendationModel, id: string): Promise<void> {
        const recommendationsForId: Recommendation[] = 
            model.recommendations.filter((x: Recommendation) => x.extensionId === id)
            .filter((x: Recommendation) => isExtensionInstalled(x.sourceId));
        const allIgnored: boolean = recommendationsForId.filter((x) => x.userIgnored === false).length === 0;
        const count = recommendationsForId.length;
        if( count === 0 || allIgnored) 
            return;
        const displayName = this.findMode(recommendationsForId.map((x) => x.extensionDisplayName)) || id;
        const msg = this.collectMessage(id, displayName, recommendationsForId);
        this.displaySingleRecommendation(id, displayName, count, msg);
    }

    private collectMessage(id: string, displayName: string, recommendationsForId: Recommendation[]): string {
        const count = recommendationsForId.length;
        if( count === 1 ) {
            const fromExtensionId = recommendationsForId[0].sourceId;
            const fromExtensionName = getInstalledExtensionName(fromExtensionId) || fromExtensionId;
            const msg: string = `${fromExtensionName} recommends you install ${displayName}:\n${recommendationsForId[0].description}`
            return msg;
        } else if( count > 1 ) {
            const countMessage = `${count} extensions recommend you install ${displayName}. `;
            const recommenderNames: string[] = recommendationsForId.map((x) => {
                const fromExtensionId = x.sourceId;
                const fromExtensionName = getInstalledExtensionName(fromExtensionId) || fromExtensionId;
                return fromExtensionName;

            });
            const lastName: string = recommenderNames[recommenderNames.length-1];
            const withoutLast: string[] = recommenderNames.slice(0, -1);
            const withoutLastAddCommas: string = withoutLast.join(", ");
            const finalMsg = countMessage + "The recommending extensions are " + withoutLastAddCommas + " and " + lastName + ". ";
            const cmdId = this.getCommandIdForExtension(id);
            const tellMeMore = `[check details](command:${cmdId})`
            return finalMsg + tellMeMore;
        } else {
            return "An unknown extension recommends that you also install " + displayName;
        }
    }

    private findMode(arr: string[]) {
        return arr.sort((a,b) =>
            arr.filter(v => v===a).length - arr.filter(v => v===b).length
        ).pop();
    }

    private async displaySingleRecommendation(id: string, extensionDisplayName: string, 
        recommenderCount: number, msg: string) {

        // Register command before prompting the user
        this.registerCommandForId(id);

        const choice = await promptUserUtil(msg);
        if (choice) {
            this.fireTelemetrySuccess(id, recommenderCount, choice);
            if( choice === UserChoice.Never) {
                await this.markIgnored(id);
            } else {
                if (choice === UserChoice.Install) {
                    await installExtensionUtil(id, extensionDisplayName, 6000);
                }
            }
        }
    }

    private async registerCommandForId(id: string) {
        const commandId = this.getCommandIdForExtension(id);
        const ret: string[] = await commands.getCommands();
        if( !ret.includes(commandId)) {
            try {
                const cmdResult = commands.registerCommand(commandId, context => {
                    this.runShowMarkdownCommand(id);
                });
                this.extensionContext.subscriptions.push(cmdResult);
            } catch( err ) {
                // Do nothing, might be a race condition / duplicate
            }
        }
    }

    private getCommandIdForExtension(id: string) {
        return "_vscode-extension-recommender.showMarkdown." + id;
    }

    private async runShowMarkdownCommand(id: string) {
        console.log("Showing webview for " + id);
        const model: RecommendationModel|undefined = await this.storageService.readRecommendationModel();        
        if( model ) {
            const recommendedExtension: Recommendation[] = model.recommendations
                .filter((x) => x.extensionId === id)
                .filter(filterUnique)
                .filter((x) => !isExtensionInstalled(x.extensionId));
            const displayName = this.findMode(recommendedExtension.map((x) => x.extensionDisplayName)) || id;
            const header = "# Extensions recommending " + displayName;
            const htmlBody = await commands.executeCommand(COMMAND_MARKDOWN_API_RENDER, header);
            console.log("\n\n\nhtml body is " + htmlBody + "\n\n\n");
        }

    }

    private async markIgnored(id: string) {
        // Mark all CURRENT (not future, from a new unknown extension) 
        // recommendations to the given id. 
        const newSession = await this.storageService.runWithLock(async (model: RecommendationModel): Promise<RecommendationModel> => {
            const current: Recommendation[] = model.recommendations;
            for( let i = 0; i < current.length; i++ ) {
                if( current[i].extensionId === id ) {
                    current[i].userIgnored = true;
                }
            }
            return model;
        });
    }

    private async fireTelemetrySuccess(target: string, recommenderCount: number, choice: string) {
        if( this.telemetryService ) {
            this.telemetryService.send({
                name: "recommendation",
                properties: {
                    recommendation: target,
                    recommenderCount: recommenderCount,
                    choice: choice.toString()
                }
            });
        }
    }

    // private async fireTelemetryFail(target: string, recommenderCount: number, errorCode: number) {
    //     if( this.telemetryService ) {
    //         this.telemetryService.send({
    //             name: "recommendation",
    //             properties: {
    //                 recommendation: target,
    //                 recommenderCount: recommenderCount,
    //                 fail: true,
    //                 code: errorCode
    //             }
    //         });
    //     }
    // }
}
