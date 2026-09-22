const router=require('express').Router();
const crypto=require('crypto');
const db=require('../config/database');
const wrap=require('../utils/asyncHandler');
const messenger=require('../services/messengerService');
function equalSecret(actual,expected){const a=Buffer.from(actual),b=Buffer.from(expected);return a.length===b.length&&crypto.timingSafeEqual(a,b);}
router.get('/:key',wrap(async(req,res)=>{
  const [connection]=await db.query('SELECT * FROM platform_connections WHERE webhook_key=?',[req.params.key]);
  if(!connection)return res.sendStatus(404);
  const expected=messenger.decrypt(connection.credentials).verifyToken;
  const actual=String(req.query['hub.verify_token']||'');
  if(req.query['hub.mode']!=='subscribe'||!equalSecret(actual,expected))return res.sendStatus(403);
  res.type('text/plain').send(String(req.query['hub.challenge']||''));
}));
router.post('/:key',wrap(async(req,res)=>{
  const [connection]=await db.query('SELECT * FROM platform_connections WHERE webhook_key=?',[req.params.key]);
  if(!connection)return res.sendStatus(404);
  const {appSecret}=messenger.decrypt(connection.credentials);
  const signature=String(req.headers['x-hub-signature-256']||'');
  const expected='sha256='+crypto.createHmac('sha256',appSecret).update(req.rawBody||Buffer.alloc(0)).digest('hex');
  if(!equalSecret(signature,expected))return res.sendStatus(403);
  if(req.body.object!=='page')return res.sendStatus(400);
  for(const entry of req.body.entry||[]) {
    if(String(entry.id)!==connection.page_id)continue;
    for(const event of entry.messaging||[])await messenger.receive(connection,event);
  }
  res.type('text/plain').send('EVENT_RECEIVED');
}));
module.exports=router;
