/**
 * @packageDocumentation
 * @module API-EVM-Transactions
 */

import { Buffer } from 'buffer/';
import BinTools from '../../utils/bintools';
import { EVMConstants } from './constants';
import { SelectCredentialClass } from './credentials';
import { KeyChain, KeyPair } from './keychain';
import { Credential } from '../../common/credentials';
import { 
  EVMStandardTx, 
  EVMStandardUnsignedTx 
} from '../../common/evmtx';
import createHash from 'create-hash';
import { EVMBaseTx } from './basetx';
import { ImportTx } from './importtx';
import { SerializedEncoding } from '../../utils/serialization';

/**
 * @ignore
 */
const bintools: BinTools = BinTools.getInstance();

/**
 * Takes a buffer representing the output and returns the proper [[EVMBaseTx]] instance.
 *
 * @param txtype The id of the transaction type
 *
 * @returns An instance of an [[EVMBaseTx]]-extended class.
 */
export const SelectTxClass = (txtype: number, ...args: any[]): EVMBaseTx => {
  // if (txtype === EVMConstants.BASETX) {
  //   return new BaseTx(...args);
  if (txtype === EVMConstants.IMPORTTX) {
    return new ImportTx(...args);
  // } else if (txtype === EVMConstants.EXPORTTX) {
  //   return new ExportTx(...args);
  }
  /* istanbul ignore next */
  throw new Error(`Error - SelectTxClass: unknown txtype ${txtype}`);
};


export class UnsignedTx extends EVMStandardUnsignedTx<KeyPair, KeyChain, EVMBaseTx> {
  protected _typeName = "UnsignedTx";
  protected _typeID = undefined;

  //serialize is inherited

  deserialize(fields: object, encoding: SerializedEncoding = "hex") {
    super.deserialize(fields, encoding);
    this.transaction = SelectTxClass(fields["transaction"]["_typeID"]);
    this.transaction.deserialize(fields["transaction"], encoding);
  }

  getTransaction(): EVMBaseTx{
    return this.transaction as EVMBaseTx;
  }

  fromBuffer(bytes: Buffer, offset: number = 0): number {
    this.codecid = bintools.copyFrom(bytes, offset, offset + 2).readUInt16BE(0);
    offset += 2;
    const txtype: number = bintools.copyFrom(bytes, offset, offset + 4).readUInt32BE(0);
    offset += 4;
    this.transaction = SelectTxClass(txtype);
    return this.transaction.fromBuffer(bytes, offset);
  }
  
  /**
   * Signs this [[UnsignedTx]] and returns signed [[StandardTx]]
   *
   * @param kc An [[KeyChain]] used in signing
   *
   * @returns A signed [[StandardTx]]
   */
  sign(kc: KeyChain): Tx {
    const txbuff: Buffer = this.toBuffer();
    const msg: Buffer = Buffer.from(createHash('sha256').update(txbuff).digest());
    const sigs: Credential[] = this.transaction.sign(msg, kc);
    return new Tx(this, sigs);
  }
}

export class Tx extends EVMStandardTx<KeyPair, KeyChain, UnsignedTx> {
  protected _typeName = "Tx";
  protected _typeID = undefined;

  //serialize is inherited

  deserialize(fields: object, encoding: SerializedEncoding = "hex") {
    super.deserialize(fields, encoding);
    this.unsignedTx = new UnsignedTx();
    this.unsignedTx.deserialize(fields["unsignedTx"], encoding);
    this.credentials = [];
    for(let i: number = 0; i < fields["credentials"].length; i++){
      const cred: Credential = SelectCredentialClass(fields["credentials"][i]["_typeID"]);
      cred.deserialize(fields["credentials"][i], encoding);
      this.credentials.push(cred);
    }
  }

  /**
   * Takes a {@link https://github.com/feross/buffer|Buffer} containing an [[Tx]], parses it, 
   * populates the class, and returns the length of the Tx in bytes.
   *
   * @param bytes A {@link https://github.com/feross/buffer|Buffer} containing a raw [[Tx]]
   * @param offset A number representing the starting point of the bytes to begin parsing
   *
   * @returns The length of the raw [[Tx]]
   */
  fromBuffer(bytes: Buffer, offset: number = 0): number {
    this.unsignedTx = new UnsignedTx();
    offset = this.unsignedTx.fromBuffer(bytes, offset);
    const numcreds: number = bintools.copyFrom(bytes, offset, offset + 4).readUInt32BE(0);
    offset += 4;
    this.credentials = [];
    for (let i: number = 0; i < numcreds; i++) {
      const credid: number = bintools.copyFrom(bytes, offset, offset + 4).readUInt32BE(0);
      offset += 4;
      const cred: Credential = SelectCredentialClass(credid);
      offset = cred.fromBuffer(bytes, offset);
      this.credentials.push(cred);
    }
    return offset;
  }

}
