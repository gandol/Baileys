import P from "pino"
import { Boom } from "@hapi/boom"
import { makeWALegacySocket, DisconnectReason, AnyMessageContent, delay, useSingleFileLegacyAuthState } from '../src'

const { state, saveState } = useSingleFileLegacyAuthState('./auth_info.json')

// start a connection
const startSock = () => {
    
    const sock = makeWALegacySocket({
        logger: P({ level: 'debug' }),
        printQRInTerminal: true,
        auth: state
    })

    const sendMessageWTyping = async(msg: AnyMessageContent, jid: string) => {
        await sock.presenceSubscribe(jid)
        await delay(500)

        await sock.sendPresenceUpdate('composing', jid)
        await delay(2000)

        await sock.sendPresenceUpdate('paused', jid)

        await sock.sendMessage(jid, msg)
    }
    
    sock.ev.on('messages.upsert', async m => {
        if(m.type === 'append' || m.type === 'notify') {
            console.log(JSON.stringify(m, undefined, 2))
        }
        
        const msg = m.messages[0]
        if(!msg.key.fromMe && m.type === 'notify') {
            console.log('replying to', m.messages[0].key.remoteJid)
            await sock!.chatRead(msg.key, 1)
            await sendMessageWTyping({ text: 'Hello there!' }, msg.key.remoteJid)
        }
        
    })

    sock.ev.on('messages.update', m => console.log(m))
    sock.ev.on('presence.update', m => console.log(m))
    sock.ev.on('chats.update', m => console.log(m))
    sock.ev.on('contacts.update', m => console.log(m))

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect } = update
        if(connection === 'close') {
            // reconnect if not logged out
            if((lastDisconnect.error as Boom)?.output?.statusCode !== DisconnectReason.loggedOut) {
                startSock()
            } else {
                console.log('connection closed')
            }
        }
        
        console.log('connection update', update)
    })
    // listen for when the auth credentials is updated
    sock.ev.on('creds.update', saveState)

    return sock
}

startSock()