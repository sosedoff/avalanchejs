import mockAxios from 'jest-mock-axios';
import { Slopes } from "src";
import AVMAPI, { PersistanceOptions } from "src/apis/avm/api";
import { AVMKeyPair, AVMKeyChain } from 'src/apis/avm/keychain';
import {Buffer} from "buffer/";
import BN from "bn.js";
import BinTools from 'src/utils/bintools';
import { UTXOSet, UTXO, SecpUTXO } from 'src/apis/avm/utxos';
import { Output, SecpOutput } from 'src/apis/avm/outputs';
import { Input, SecpInput } from 'src/apis/avm/inputs';
import createHash from "create-hash";
import { TxUnsigned, Tx } from 'src/apis/avm/tx';
import { UnixNow } from 'src/apis/avm/types';

/**
 * @ignore
 */
const bintools = BinTools.getInstance();

describe("AVMAPI", () => {
    const networkid:number = 49;
    const blockchainid:string = "6h2s5de1VC65meajE1L2PjvZ1MXvHc3F6eqPCGKuDt4MxiweF";
    const ip:string = '127.0.0.1';
    const port:number = 9650;
    const protocol:string = "https";

    let username:string = 'AvaLabs';
    let password:string = 'password';

    let slopes:Slopes = new Slopes(ip,port,protocol, networkid, undefined, true);
    let api:AVMAPI;

    beforeAll(() => {
        api = new AVMAPI(slopes, "/ext/subnet/avm", blockchainid);
    });

    afterEach(() => {
        mockAxios.reset();
    });

    test('createAsset', async ()=>{
        let kp:AVMKeyPair = new AVMKeyPair();
        kp.importKey(Buffer.from("ef9bf2d4436491c153967c9709dd8e82795bdb9b5ad44ee22c2903005d1cf676", "hex"));
        
        let amount:number = 10000;
        let address:string = kp.getAddress();
        let assetid:string = "8a5d2d32e68bc50036e4d086044617fe4a0a0296b274999ba568ea92da46d533";

        let result:Promise<string> = api.createAsset(amount,address);
        let payload:object = {
            "result": {
                'assetID': assetid
            }
        };
        let responseObj = {
            data: payload
        };

        mockAxios.mockResponse(responseObj);
        let response:string = await result;

        expect(mockAxios.request).toHaveBeenCalledTimes(1);
        expect(response).toBe(assetid);
    });

    test('getTxStatus', async ()=>{
        let txid:string = "f966750f438867c3c9828ddcdbe660e21ccdbb36a9276958f011ba472f75d4e7";

        let result:Promise<string> = api.getTxStatus(txid);
        let payload:object = {
            "result": {
                'status': "accepted"
            }
        };
        let responseObj = {
            data: payload
        };

        mockAxios.mockResponse(responseObj);
        let response:string = await result;

        expect(mockAxios.request).toHaveBeenCalledTimes(1);
        expect(response).toBe("accepted");
    });

    test('getUTXOs', async ()=>{
        //Payment
        let OPUTXOstr1:string = "8snom9a21FvVHqyasGGAZKSDjQXJg7CvTvA53is6uyhBxvGbc5WVACRoyscZZ1TGpqiGHTbmMBfMq6qE8fqTBFQTsMGJhQw68T1A9WBcazbMvGv6s6DtKV66sKPXLemTK6miMYWvjcvRCH6rihj7vpDa3Ffp2Jq2QZtJ";
        let OPUTXOstr2:string = "U9rFgK5jjdXmV8k5tpqeXkimzrN3o9eCCcXesyhMBBZu9MQJCDTDo5Wn5psKvzJVMJpiMbdkfDXkp7sKZddfCZdxpuDmyNy7VFka19zMW4jcz6DRQvNfA2kvJYKk96zc7uizgp3i2FYWrB8mr1sPJ8oP9Th64GQ5yHd8";
        let OPUTXOstr3:string = "adUbkxszkX9FbvnyKu6UA4g7XhAmPVj6PgPhLS6dTtUfCCr7oDEEXNYqWD2q5MuKPGgEhX16V451kAEUyYhiFMPYCjsAiCM1oWKnLmeA9joFr9jDYD5AoLAsVEyM13FZPf8vuKmF6JTZdCbMCgzHYrMjnb9i3iDPN4Qg";

        let set:UTXOSet = new UTXOSet();
        set.add(OPUTXOstr1);
        set.addArray([OPUTXOstr2, OPUTXOstr3]);

        let persistOpts:PersistanceOptions = new PersistanceOptions("test", true, "union");
        expect(persistOpts.getMergeRule()).toBe("union");

        let result:Promise<UTXOSet> = api.getUTXOs(set.getAddresses(), persistOpts);
        let payload:object = {
            "result": {
                'utxos': [OPUTXOstr1, OPUTXOstr2, OPUTXOstr3]
            }
        };
        let responseObj = {
            data: payload
        };

        mockAxios.mockResponse(responseObj);
        let response:UTXOSet = await result;

        expect(mockAxios.request).toHaveBeenCalledTimes(1);
        expect(JSON.stringify(response.getAllUTXOStrings().sort())).toBe(JSON.stringify(set.getAllUTXOStrings().sort()));

        result = api.getUTXOs(set.getAddresses(), persistOpts);
        

        mockAxios.mockResponse(responseObj);
        response = await result;

        expect(mockAxios.request).toHaveBeenCalledTimes(2);
        expect(JSON.stringify(response.getAllUTXOStrings().sort())).toBe(JSON.stringify(set.getAllUTXOStrings().sort()));
    });

    describe('Transactions', () => {
        let set:UTXOSet;
        let keymgr2:AVMKeyChain;
        let keymgr3:AVMKeyChain;
        let addrs1:Array<string>;
        let addrs2:Array<string>;
        let addrs3:Array<string>;
        let utxos:Array<SecpUTXO>;
        let inputs:Array<SecpInput>;
        let outputs:Array<SecpOutput>;
        const amnt:number = 10000;
        let assetID:Buffer = Buffer.from(createHash("sha256").update("mary had a little lamb").digest());
        
        beforeEach(() => {
            set = new UTXOSet();
            api.newKeyChain()
            keymgr2 = new AVMKeyChain();
            keymgr3 = new AVMKeyChain();
            addrs1 = [];
            addrs2 = [];
            addrs3 = [];
            utxos = [];
            inputs = [];
            outputs = [];



            for(let i:number = 0; i < 3; i++){
                addrs1.push(api.keyChain().makeKey());
                addrs2.push(keymgr2.makeKey());
                addrs3.push(keymgr3.makeKey());
            }
            let amount:BN = new BN(amnt);
            let addresses:Array<string> = api.keyChain().getAddresses();
            let fallAddresses:Array<string> = keymgr2.getAddresses()
            let locktime:BN = new BN(54321);
            let fallLocktime:BN = locktime.add(new BN(50));
            let threshold:number = 3;
            let fallThreshold:number = 1;
            
            for(let i:number = 0; i < 5; i++){
                let txid:Buffer = Buffer.from(createHash("sha256").update(bintools.fromBNToBuffer(new BN(i), 32)).digest());
                let txidx:Buffer = Buffer.from(bintools.fromBNToBuffer(new BN(i), 4));
                let out:SecpOutput;
                out = new SecpOutput(assetID, amount, addresses, locktime, threshold);
                outputs.push(out);
    
                let u:SecpUTXO = new SecpUTXO();
                u.fromBuffer(Buffer.concat([txid, txidx, out.toBuffer()]));
                utxos.push(u);
    
                txid = u.getTxID();
                txidx = u.getTxIdx();
                let asset = u.getAssetID();
    
                let input:SecpInput = new SecpInput(txid, txidx, amount, asset);
                inputs.push(input);
            }
            set.addArray(utxos);
        });

        test('makeUnsignedTx1', () => {
    
            let txu1:TxUnsigned = api.makeUnsignedTx(set, new BN(amnt), addrs3, addrs1, addrs1, bintools.avaSerialize(assetID));
            let txu2:TxUnsigned = set.makeUnsignedTx(
                networkid, bintools.avaDeserialize(blockchainid), new BN(amnt), 
                addrs3, addrs1, addrs1, assetID, 
                UnixNow(), new BN(0), 1
            );
            
            expect(txu2.toBuffer().toString("hex")).toBe(txu1.toBuffer().toString("hex"));
            expect(txu2.toString()).toBe(txu1.toString());
            
        });

        test('makeUnsignedTx2', () => {
            let txu1:TxUnsigned = api.makeUnsignedTx(set, new BN(amnt).sub(new BN(100)), addrs3, addrs1, addrs2, bintools.avaSerialize(assetID));
            let txu2:TxUnsigned = set.makeUnsignedTx(
                networkid, bintools.avaDeserialize(blockchainid), new BN(amnt).sub(new BN(100)), 
                addrs3, addrs1, addrs2, assetID, 
                UnixNow(), new BN(0), 1
            );
            
            expect(txu2.toBuffer().toString("hex")).toBe(txu1.toBuffer().toString("hex"));
            expect(txu2.toString()).toBe(txu1.toString());
            
            let outies = txu1.getOuts().sort(SecpOutput.comparator()) as Array<SecpOutput>;

            expect(outies.length).toBe(2);
            let outaddr0 = Object.keys(outies[0].getAddresses());
            let outaddr1 = Object.keys(outies[1].getAddresses());

            let testaddr2 = JSON.stringify(addrs2.sort());
            let testaddr3 = JSON.stringify(addrs3.sort());

            let testout0 = JSON.stringify(outaddr0.sort());
            let testout1 = JSON.stringify(outaddr1.sort());
            expect(
                (testaddr2 == testout0 && testaddr3 == testout1)
                ||
                (testaddr3 == testout0 && testaddr2 == testout1)).toBe(true);
        });

        test('signTx', () => {
            let txu1:TxUnsigned = api.makeUnsignedTx(set, new BN(amnt), addrs3, addrs1, addrs1, bintools.avaSerialize(assetID));
            let txu2:TxUnsigned = set.makeUnsignedTx(
                networkid, bintools.avaDeserialize(blockchainid), new BN(amnt), 
                addrs3, addrs1, addrs1, assetID, UnixNow(), 
                new BN(0), 1
            );
            
            let tx1:Tx = api.signTx(txu1);
            let tx2:Tx = api.signTx(txu2);

            expect(tx2.toBuffer().toString("hex")).toBe(tx1.toBuffer().toString("hex"));
            expect(tx2.toString()).toBe(tx1.toString());
            
        });

        test('issueTx Serialized', async ()=>{
            let txu:TxUnsigned = api.makeUnsignedTx(set, new BN(amnt), addrs3, addrs1, addrs1, bintools.avaSerialize(assetID));
            let tx = api.signTx(txu);

            let txid:string = "f966750f438867c3c9828ddcdbe660e21ccdbb36a9276958f011ba472f75d4e7";

            let result:Promise<string> = api.issueTx(tx.toString());
            let payload:object = {
                "result": {
                    'txID': txid
                }
            };
            let responseObj = {
                data: payload
            };
    
            mockAxios.mockResponse(responseObj);
            let response:string = await result;
    
            expect(mockAxios.request).toHaveBeenCalledTimes(1);
            expect(response).toBe(txid);
        });

        test('issueTx Buffer', async ()=>{
            let txu:TxUnsigned = api.makeUnsignedTx(set, new BN(amnt), addrs3, addrs1, addrs1, bintools.avaSerialize(assetID));
            let tx = api.signTx(txu);

            let txid:string = "f966750f438867c3c9828ddcdbe660e21ccdbb36a9276958f011ba472f75d4e7";
    
            let result:Promise<string> = api.issueTx(tx.toBuffer());
            let payload:object = {
                "result": {
                    'txID': txid
                }
            };
            let responseObj = {
                data: payload
            };
    
            mockAxios.mockResponse(responseObj);
            let response:string = await result;
    
            expect(mockAxios.request).toHaveBeenCalledTimes(1);
            expect(response).toBe(txid);
        });

        test('issueTx Class Tx', async ()=>{
            let txu:TxUnsigned = api.makeUnsignedTx(set, new BN(amnt), addrs3, addrs1, addrs1, bintools.avaSerialize(assetID));
            let tx = api.signTx(txu);

            let txid:string = "f966750f438867c3c9828ddcdbe660e21ccdbb36a9276958f011ba472f75d4e7";
    
            let result:Promise<string> = api.issueTx(tx);
            let payload:object = {
                "result": {
                    'txID': txid
                }
            };
            let responseObj = {
                data: payload
            };
    
            mockAxios.mockResponse(responseObj);
            let response:string = await result;
    
            expect(mockAxios.request).toHaveBeenCalledTimes(1);
            expect(response).toBe(txid);
        });

    });
    

});