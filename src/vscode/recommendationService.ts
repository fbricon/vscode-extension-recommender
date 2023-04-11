import { Recommendation } from "./recommendationModel";

export interface IRecommendationService {
    /**
     * Register a recommendation in the model
     */
    registerRecommendations(recommendations: Recommendation[]): Promise<void>;

    /**
     * Show a recommendation immediately
     */
    showRecommendation(fromExtension: string, toExtension: string): Promise<void>;
}