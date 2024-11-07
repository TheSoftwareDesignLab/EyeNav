export declare abstract class SignalingClient {
    id: string;
    constructor(id?: string);
    readSignal(signal: string, timeout?: Number): Promise<unknown>;
    private waitForSignalOrTimeout;
    writeSignal(receiverInboxId: string, signal: string): void;
    createInbox(): void;
    resetInbox(): void;
    deleteInbox(): void;
    inboxLastSignal(): any;
    currentInboxFilePath(): string;
    private inboxFilePathForId;
}
//# sourceMappingURL=SignalingClient.d.ts.map