export interface RecommendationModel {
    lastUpdated: number,
    sessionId: string,
    sessionTimestamp: number,
    recommendations: Recommendation[]
}

export interface Recommendation {
    extensionId: string, 
    extensionDisplayName: string,
    description: string, 
    sourceId: string,
    timestamp: number,
    shouldShowOnStartup: boolean,
    userIgnored: boolean,
}


export enum UserChoice {
	Install = "Install",
	Never = "Never",
	Later = "Later",
}