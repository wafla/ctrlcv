const oracledb = require("oracledb")

oracledb.autoCommit = false
oracledb.outFormat = oracledb.OUT_FORMAT_OBJECT

export async function getConnection(){
    const conn = await oracledb.getConnection({
        user: process.env.ORACLE_USER!,
        password: process.env.ORACLE_PASSWORD!,
        connectString: process.env.ORACLE_CONNECT_STRING!,
        configDir: process.env.ORACLE_WALLET_DIR!,
        walletLocation: process.env.ORACLE_WALLET_DIR!,
        walletPassword: process.env.ORACLE_WALLET_PASSWORD!,
    })
    
    await conn.execute(`ALTER SESSION SET TIME_ZONE = 'UTC'`)
    
    return conn
}