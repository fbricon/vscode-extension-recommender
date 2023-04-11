import { TelemetryService } from "@redhat-developer/vscode-redhat-telemetry/lib";
import path from "path";
import { ExtensionContext } from "vscode";
import { Recommendation, RecommendationModel } from "../recommendationModel";
import { IRecommendationService } from "../recommendationService";
import { IStorageService } from "../storageService";
import { StorageServiceImpl } from "./storageServiceImpl";
import { isExtensionInstalled } from "./vscodeUtil";

export class RecommendationServiceImpl implements IRecommendationService {
    private source: string;
    private storageService: IStorageService;
    private TelemetryServiceBuilder: TelemetryService | undefined;

    constructor(context: ExtensionContext, private telemetryService?: TelemetryService) {
        this.source = context.extension.id;
        const storagePath = this.getRecommendationWorkingDir(context);
        this.storageService = new StorageServiceImpl(storagePath);
    }

    private getRecommendationWorkingDir(context: ExtensionContext): string {
        return path.resolve(context.globalStorageUri.fsPath, '..', 'vscode-extension-recommender');
    }

    public async registerRecommendations(toAdd: Recommendation[]): Promise<void> {
        const newSession: boolean = await this.addRecommendationsToModel(toAdd);
        if( newSession ) {
            // Return fast (ie, don't await) so as not to slow down caller
            this.showStartupRecommendations();
        }
    }

    public async addRecommendationsToModel(toAdd: Recommendation[]): Promise<boolean> {
        const newSession = await this.storageService.runWithLock(async (model: RecommendationModel): Promise<RecommendationModel> => {
            const current: Recommendation[] = model.recommendations;
            const newRecs: Recommendation[] = [];
            for( let i = 0; i < current.length; i++ ) {
                const beingAdded = this.findRecommendation(current[i].sourceId, current[i].extensionId, toAdd);
                if( beingAdded ) {
                    beingAdded.userIgnored = current[i].userIgnored;
                    newRecs.push(beingAdded);
                } else {
                    newRecs.push(current[i]);
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
            return undefined;
        }
    }
    
    public async showRecommendation(fromExtension: string, toExtension: string): Promise<void> {
        // Show a single recommendation immediately
        if(isExtensionInstalled(fromExtension) && !isExtensionInstalled(toExtension)) {
            // this.telemetryService?.send({
            //     name: "recommendation",
            //     properties: {
            //         recommendation: id,
            //         choice: choice.toString()
            //     }
            // });

        }
    }

    public async showStartupRecommendations(): Promise<void> {
        // wait 6 seconds for other tools to start up
        await new Promise(resolve => setTimeout(resolve, 6000));
        // Then show the dialogs
    }
}
