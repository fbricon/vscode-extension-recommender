import * as fs from 'fs';
import path from "path";
import { env } from "vscode";
import { RecommendationModel } from '../recommendationModel';
import { IStorageService } from '../storageService';

export class StorageServiceImpl implements IStorageService {
    private static PERSISTENCE_FILENAME: string = 'extension-recommender.model.json';
    private static LOCK_FILENAME: string = 'extension-recommender.lock';
    private storagePath: string;

    constructor(storagePath: string) {
        this.storagePath = storagePath;
        if (!fs.existsSync(storagePath)) {
            fs.mkdirSync(storagePath, { recursive: true });
        }
    }

    private async delay(ms: number): Promise<void> {
        await new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Run a given runnable while ensuring only 1 client can write to the data store at a time.
     * @returns boolean - whether vscode is in a new session vs what the data store thought
     */
    public async runWithLock(runnable: (model: RecommendationModel) => Promise<RecommendationModel>): Promise<boolean> {
        // TODO if we are locked, wait for unlock
        let waited = 0;
        while(this.isLocked() && waited < 10000) {
            await this.delay(100);
            waited += 100;
        }
        if( waited >= 10000 || this.isLocked()) {
            return Promise.reject("Unable to get a lock on recommendations file");
        }
        this.lock();
        try {
            const model: RecommendationModel = await this.loadOrDefault();
            const model2 = await runnable(model);
            return await this.save(model2);
        } finally {
            this.unlock();
        }
    }

    private async lock(): Promise<void> {
        const file = this.resolvePath(StorageServiceImpl.LOCK_FILENAME);
        await this.writeToFile(file, ""+Date.now());
    }
    private async unlock(): Promise<void> {
        const file = this.resolvePath(StorageServiceImpl.LOCK_FILENAME);
        if (!fs.existsSync(file)) {
            fs.unlinkSync(file);
        }
    }
    private isLocked(): boolean {
        const file = this.resolvePath(StorageServiceImpl.LOCK_FILENAME);
        return fs.existsSync(file);
    }

    public async read(): Promise<RecommendationModel | undefined> {
        return this.load();
    }

    private async load(): Promise<RecommendationModel | undefined> {
        const json = await this.readFromFile(StorageServiceImpl.PERSISTENCE_FILENAME);
        if (json) {
            return JSON.parse(json) as RecommendationModel;
        }
        return undefined;
    }
    private async loadOrDefault(): Promise<RecommendationModel> {
        const def: RecommendationModel = {
            lastUpdated: Date.now(),
            sessionId: env.sessionId,
            sessionTimestamp: Date.now(),
            recommendations: []
        }
        let ret = await this.load();
        if( !ret ) {
            return def;
        }
        return ret;
    }

    private async save(model: RecommendationModel): Promise<boolean> {
        const now = Date.now();
        let newSession = false;
        if( env.sessionId !== model.sessionId) {
            model.sessionId = env.sessionId;
            model.sessionTimestamp = now;
            newSession = true;
        }
        model.lastUpdated = now;
        const json = JSON.stringify(model);
        await this.writeToFile(StorageServiceImpl.PERSISTENCE_FILENAME, json);
        return newSession;
    }

    private async readFromFile(filename: string): Promise<string | undefined> {
        const filePath = this.resolvePath(filename);
        if (!fs.existsSync(filePath))
            return undefined;
        return fs.readFileSync(filePath, 'utf8');
    }

    private async writeToFile(filename: string, value: string): Promise<boolean> {
        try {
            fs.writeFileSync(this.resolvePath(filename), value);
            return true;
        } catch( err ) {
            return false;
        }
    }
    private resolvePath(filename: string): string {
        const filePath = path.resolve(this.storagePath, filename);
        return filePath;
    }
}