import * as fs from 'fs';
import { Connection, Keypair, PublicKey, SystemProgram } from '@solana/web3.js';
import { Program, Provider, Wallet } from '@project-serum/anchor';

// FIELDS YOU NEED TO ADD HERE!!!! 
import adminSecret from '/root/.config/solana/id.json'; // enter your kp path here!
const farmId = '';
const gemFarmProgramId = '';
const gemBankProgramId = '';
const nftList = JSON.parse(fs.readFileSync('./sample.json', 'utf8'));
const farmIdl = JSON.parse(fs.readFileSync('../target/idl/gem_farm.json', 'utf8'));
const bankIdl = JSON.parse(fs.readFileSync('../target/idl/gem_bank.json', 'utf8'));
// UPDATE dev or mainnet in line 85!!!
// END FIELDS YOU NEED TO ADD!!!!

const clusterURLMapping = {
    mainnet:
        process.env.VUE_APP_MAINNET_URL || 'https://api.mainnet-beta.solana.com',
    devnet: process.env.VUE_APP_DEVNET_URL || 'https://api.devnet.solana.com',
    testnet: process.env.VUE_APP_TESTNET_URL || 'https://api.testnet.solana.com',
    localnet: process.env.VUE_APP_LOCALNET_URL || 'http://localhost:8899',
};

enum WhitelistType {
    Creator = 1 << 0,
    Mint = 1 << 1,
}

const adminKp = Keypair.fromSecretKey(new Uint8Array(adminSecret));
const adminWallet = new Wallet(adminKp);

async function getProvider(networkUrl: string) {
    const connection = new Connection(networkUrl, 'processed');
    const provider = new Provider(
        connection, adminWallet,  Provider.defaultOptions(),
    );
    return provider;
}

export class GemClient {
    farmProgram: Program;
    bankProgram: Program;

    constructor(fp: Program, bp: Program) {
        this.farmProgram = fp;
        this.bankProgram = bp;
    }

    async findProgramAddress(
        programId: PublicKey,
        seeds: (PublicKey | Uint8Array | string)[]
      ): Promise<[PublicKey, number]> {
        const seed_bytes = seeds.map((s) => {
          if (typeof s == 'string') {
            return Buffer.from(s);
          } else if ('toBytes' in s) {
            return s.toBytes();
          } else {
            return s;
          }
        });
        return await PublicKey.findProgramAddress(seed_bytes, programId);
    }

    async fetchFarmAcc(farm: PublicKey) {
        return this.farmProgram.account.farm.fetch(farm);
    }

    async findFarmAuthorityPDA(farm: PublicKey) {
        return this.findProgramAddress(this.farmProgram.programId, [farm]);
    }

    async findWhitelistProofPDA(bank: PublicKey, whitelistedAddress: PublicKey) {
        return this.findProgramAddress(this.bankProgram.programId, [
          'whitelist',
          bank,
          whitelistedAddress,
        ]);
    }
    
}

async function initialize() {
    // initialize provider and program
    const provider = await getProvider(clusterURLMapping.mainnet);
    const program = new Program(farmIdl, gemFarmProgramId, provider);
    console.log(nftList);
    
    const farmProgram = new Program(
        farmIdl,
        gemFarmProgramId,
        provider,
    );

    const bankProgram = new Program(
        bankIdl,
        gemBankProgramId,
        provider,
    );

    // get list of ids
    await addNftsToFarm(provider, farmId, nftList, adminWallet, farmProgram, bankProgram);
}

async function addNftsToFarm(
    provider: Provider, 
    farmId: string, 
    nftList: string, 
    wallet: Wallet, 
    farmProgram: Program, 
    bankProgram: Program
) {
    // get Farm PDA
    
    const fp = new GemClient(farmProgram, bankProgram);
    const farm = new PublicKey(farmId);

    const farmAcc = await fp.fetchFarmAcc(farm);
    const whitelistType = WhitelistType.Creator;

    const [farmAuth, farmAuthBump] = await fp.findFarmAuthorityPDA(farm);
    
    for (let i = 0; i < nftList.length; i++) {
        
        const addressToWhitelist = new PublicKey(nftList[i]);
        const [whitelistProof, whitelistProofBump] =
        await fp.findWhitelistProofPDA(farmAcc.bank, addressToWhitelist);
        const signers = [];
        signers.push(adminKp);

        console.log(`adding ${addressToWhitelist.toBase58()} to whitelist`);
        const txSig = await farmProgram.rpc.addToBankWhitelist(
            farmAuthBump,
            whitelistProofBump,
            whitelistType,
            {
                accounts: {
                farm,
                farmManager: wallet.publicKey,
                farmAuthority: farmAuth,
                bank: farmAcc.bank,
                addressToWhitelist,
                whitelistProof,
                systemProgram: SystemProgram.programId,
                gemBank: bankProgram.programId,
                },
                signers,
            }
        );
    }
}

initialize();