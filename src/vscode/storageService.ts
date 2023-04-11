import { Recommendation, RecommendationModel } from "./recommendationModel";

export interface IStorageService {
    // /**
    //  * Return the recommendation model from the backing store, 
    //  * or undefined if it does not exist
    //  */
    // load(): Promise<RecommendationModel|undefined>;

    // /**
    //  * Save the given model in the backing store
    //  * @param model 
    //  * @returns true if this is a new vscode session; false otherwise
    //  */
    // save(model: RecommendationModel): Promise<boolean>;

    /**
     * Run the given runnable while locking write access to the model
     * @param runnable 
     */
    runWithLock(runnable: (model: RecommendationModel) => Promise<RecommendationModel>): Promise<boolean>;
}