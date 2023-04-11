import {commands, Disposable, extensions, window} from 'vscode';
import { UserChoice } from '../recommendationModel';

export const promptUserUtil = async (message: string): Promise<UserChoice | undefined> => {
    const actions: Array<string> = Object.keys(UserChoice);
    const choice = await window.showInformationMessage(message, ...actions);
    if (choice) {
        return choice as UserChoice;
    }
    return undefined;
}

export const isExtensionInstalled = (id: string): boolean => {
    return !!extensions.getExtension(id);
}

/**
 * Install an extension
 *
 * @returns when the extension is installed
 * @throws if the user refuses to install the extension, or if the extension does not get installed within a timeout period
 */
 export const installExtensionUtil = async (id: string, label: string, timeout: number): Promise<void> => {
    let installListenerDisposable: Disposable;
    return new Promise<void>((resolve, reject) => {
        installListenerDisposable = extensions.onDidChange(() => {
            if (isExtensionInstalled(id)) {
                resolve();
            }
        });
        commands.executeCommand("workbench.extensions.installExtension", id)
                .then((_unused: any) => { }, reject);
        setTimeout(reject, timeout, new Error(`'${label}' installation is taking a while, Cancelling!`));
    }).finally(() => {  
        installListenerDisposable.dispose();
    });
}
