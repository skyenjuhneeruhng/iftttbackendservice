const fs = require('fs');

const express = require('express');
const http = require('http');
const https = require('https');

const path = require('path');
const jwt = require('jsonwebtoken');
const request = require('request');
var ip              = require('ip');
var bodyParser      = require('body-parser');
var uuid = require('uuid');

const IFTTT_SERVICE_KEY = 'nEa9w1naPQPh4TsxE6bFoVw5nY5qQS45OlknUrhlAJXfC11kiB8tabvxY1z41aud';
const IFTTT_CHANNEL_KEY = 'nEa9w1naPQPh4TsxE6bFoVw5nY5qQS45OlknUrhlAJXfC11kiB8tabvxY1z41aud';
const IFTTT_PREFIX = '/ifttt/v1'
const HTTPS_PORT_NUM = 443;
const ACTION_EXECUTION_FREQUENCY = 500;


const TRIGGER_TYPE_TWITCH = "twitch";
const TRIGGER_TYPE_KITCHENSYNCIP = "kitchensyncip";
/**************************************************************************************************/
Que = function()
{
    this.firstObject = undefined;
    this.append = function(obj)
    {
        if(this.firstObject == undefined)
        {
            this.firstObject = obj;
            return;
        }
        else
        {
            this.setNext(this.firstObject , obj);
        }
    }
    this.setNext = function(obj1 , obj2)
    {
        if(obj1.next != undefined)
            this.setNext(obj1.next , obj2);
        else
            obj1.next = obj2;
    }
    this.removeFirst = function()
    {
        if(this.firstObject == undefined)
            return;
        else
            this.firstObject = this.firstObject.next;
    }
}
Action = function(cam_ip , preset_num)
{
  this.ptz_cam_ip = cam_ip;
  this.ptz_preset_num = preset_num;
  this.ptz_uuid = uuid.v4();
  this.execute = function()
  {
    var self = this;
    var url = "http://" + self.ptz_cam_ip + "/cgi-bin/ptzctrl.cgi?ptzcmd&poscall&" + self.ptz_preset_num;
    request(
      url,
      {
        method : 'GET'
      },
      (err, res) => {
        if (err) {
          console.log(url + 'PTZCONTROL FAILED' , err.message , new Date());
        } else {
          console.log(url + 'PTZCONTROL SUCCESS' , new Date());                    
        }
    });
  };
}

Trigger = function(trigger_type , trigger_num){
  this.ptz_trigger_type = trigger_type;
  this.ptz_trigger_num = trigger_num;
  var d = new Date();
  this.ptz_time_stamp = parseInt(d.getTime() / 1000);
  this.ptz_uuid = uuid.v4();
  this.ptz_created_at = d;
}

var triggerList = {};
var actionQue = new Que();

function addTrigger(type , num)
{
  if(triggerList == undefined)
    triggerList = {};
  if(type != TRIGGER_TYPE_KITCHENSYNCIP && type != TRIGGER_TYPE_TWITCH)
    return;
  if(triggerList[type] == undefined)
    triggerList[type] = {};
  if(triggerList[type]['' + num] == undefined)
    triggerList[type]['' + num] = [];

  var trigger = new Trigger(type , num);
  triggerList[type]['' + num][triggerList[type]['' + num].length] = trigger;
}

function removeOld(type , trig_num)
{
  if(triggerList == undefined)
    return;
  
  if(triggerList[type] == undefined)
    return;
  if(triggerList[type]['' + num] == undefined)
    return;
  var trig_arr = triggerList[type]["" + trig_num];
  if(trig_arr.length > 50)
  {
    var offset = trig_arr.length - 50;
    trig_arr = trig_arr.slice(offset);
  }
  return;
}

function pollTriggers(type , trig_num , limit)
{
  if(limit > 50)
    limit = 50;

  var recentEvents = [];
  if(triggerList[type] == undefined)
    return recentEvents;
  console.log("Trigger List is defined");
  if(triggerList[type]["" + trig_num] == undefined)
    return recentEvents;
  var count = triggerList[type]["" + trig_num].length;
  console.log("Trigger Count" , count);
  if(count < limit)
    limit = count;
  for(var i = (count - 1) ; i > (count - limit - 1) ; i --)
  {
    var eventOne = {
      created_at : triggerList[type]["" + trig_num][i].ptz_created_at,
      meta : { 
        id : triggerList[type]["" + trig_num][i].ptz_uuid,
        timestamp : triggerList[type]["" + trig_num][i].ptz_time_stamp
      }
    }
    recentEvents[recentEvents.length] = eventOne;
  }
  removeOld();
  return recentEvents;
}

function pushAction(cam_ip , preset_num)
{
  var action = new Action(cam_ip , preset_num);
  actionQue.append(action);
  return action.ptz_uuid;
}
/**************************************************************************************************/

const app = express();

app.use((req, res, next) => {
  console.log('GOT REQUEST', req.path, req.method , 'FROM' , req.ip , 'AT' , new Date());
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
  res.setHeader('Access-Control-Allow-Methods', 'OPTIONS, GET, POST');
  res.setHeader('Access-Control-Allow-Origin', '*');
  return next();
});

app.use(bodyParser.json());

let options = {
   key  : fs.readFileSync('./conf/private.key'),
   cert : fs.readFileSync('./conf/certificate.crt')
};

/*******************************************routes********************************************/


//this is for test
app.get('/' , function(req, res, next){
    res.json({status : 'success' , msg : 'congratulations!'});
});
app.get(IFTTT_PREFIX + '/status' , function(req, res, next){
  var service_key = req.headers['ifttt-service-key'];
  var channel_key = req.headers['ifttt-channel-key'];
  if(service_key == IFTTT_SERVICE_KEY)
  {
    res.writeHead(200);
    res.end();
  } 
  else
  {
    res.writeHead(401);
    res.end();
  }
});

app.post(IFTTT_PREFIX + "/test/setup" , function(req, res, next){
  var service_key = req.headers['ifttt-service-key'];
  var channel_key = req.headers['ifttt-channel-key'];
  if(channel_key == IFTTT_CHANNEL_KEY)
  {
    var data = {
      samples : {
        actions : {
          ptzoptics_1 : {
            ptzoptics_camera_ipdynamic_dns : "0.0.0.0"
          },
          ptzoptics_2 : {
            ptzoptics_camera_ipdynamic_dns : "0.0.0.0"
          },
          ptzoptics_3 : {
            ptzoptics_camera_ipdynamic_dns : "0.0.0.0"
          }
          ,ptzoptics_4 : {
            ptzoptics_camera_ipdynamic_dns : "0.0.0.0"
          },
          ptzoptics_5 : {
            ptzoptics_camera_ipdynamic_dns : "0.0.0.0"
          },
          ptzoptics_6 : {
            ptzoptics_camera_ipdynamic_dns : "0.0.0.0"
          }
        }
      }
    }
    res.json({data : data});

  }
  else
  {
    res.writeHead(401);
    res.end();
  }
});
//push trigger.....................................................................
app.post('/api/twitch/:num' , function(req , res , next){
  var trigger_num = req.params.num;
  console.log('Trigger number:' , trigger_num);
  addTrigger(TRIGGER_TYPE_TWITCH , trigger_num);
  res.writeHead(200);
  res.end();
});
app.post('/api/kitchensyncip/:num' , function(req , res , next){
  var trigger_num = req.params.num;
  console.log('Trigger number:' , trigger_num);
  addTrigger(TRIGGER_TYPE_KITCHENSYNCIP , trigger_num);
  res.writeHead(200);
  res.end();
});
//polling trigger..................................................................
app.post(IFTTT_PREFIX + "/triggers/twitch_1" , function(req , res , next){
  var channel_key = req.headers['ifttt-channel-key'];
  var limit = req.body.limit;
  if(limit == undefined)
    limit = 50;
  if(channel_key == IFTTT_CHANNEL_KEY)
  {
    res.json({data : pollTriggers(TRIGGER_TYPE_TWITCH , 1 , limit)});
    res.end();
  }
  else
  {
    var errors = [{message : "Invalid channel key!"}];
    res.status(401).json({errors : errors});
    res.end();
  }
});

app.post(IFTTT_PREFIX + "/triggers/twitch_2" , function(req , res , next){
  var channel_key = req.headers['ifttt-channel-key'];
  var limit = req.body.limit;
  if(limit == undefined)
    limit = 50;
  if(channel_key == IFTTT_CHANNEL_KEY)
  {
    res.json({data : pollTriggers(TRIGGER_TYPE_TWITCH , 2 , limit)});
    res.end();
  }
  else
  {
    var errors = [{message : "Invalid channel key!"}];
    res.status(401).json({errors : errors});
    res.end();
  }
});

app.post(IFTTT_PREFIX + "/triggers/twitch_3" , function(req , res , next){
  var channel_key = req.headers['ifttt-channel-key'];
  var limit = req.body.limit;
  if(limit == undefined)
    limit = 50;
  if(channel_key == IFTTT_CHANNEL_KEY)
  {
    res.json({data : pollTriggers(TRIGGER_TYPE_TWITCH , 3 , limit)});
    res.end();
  }
  else
  {
    var errors = [{message : "Invalid channel key!"}];
    res.status(401).json({errors : errors});
    res.end();
  }
});

app.post(IFTTT_PREFIX + "/triggers/twitch_4" , function(req , res , next){
  var channel_key = req.headers['ifttt-channel-key'];
  var limit = req.body.limit;
  if(limit == undefined)
    limit = 50;
  if(channel_key == IFTTT_CHANNEL_KEY)
  {
    res.json({data : pollTriggers(TRIGGER_TYPE_TWITCH , 4 , limit)});
    res.end();
  }
  else
  {
    var errors = [{message : "Invalid channel key!"}];
    res.status(401).json({errors : errors});
    res.end();
  }
});

app.post(IFTTT_PREFIX + "/triggers/twitch_5" , function(req , res , next){
  var channel_key = req.headers['ifttt-channel-key'];
  var limit = req.body.limit;
  if(limit == undefined)
    limit = 50;
  if(channel_key == IFTTT_CHANNEL_KEY)
  {
    res.json({data : pollTriggers(TRIGGER_TYPE_TWITCH , 5 , limit)});
    res.end();
  }
  else
  {
    var errors = [{message : "Invalid channel key!"}];
    res.status(401).json({errors : errors});
    res.end();
  }
});

app.post(IFTTT_PREFIX + "/triggers/twitch_6" , function(req , res , next){
  var channel_key = req.headers['ifttt-channel-key'];
  var limit = req.body.limit;
  if(limit == undefined)
    limit = 50;
  if(channel_key == IFTTT_CHANNEL_KEY)
  {
    res.json({data : pollTriggers(TRIGGER_TYPE_TWITCH , 6 , limit)});
    res.end();
  }
  else
  {
    var errors = [{message : "Invalid channel key!"}];
    res.status(401).json({errors : errors});
    res.end();
  }
});

app.post(IFTTT_PREFIX + "/triggers/kitchensyncip_1" , function(req , res , next){
  var channel_key = req.headers['ifttt-channel-key'];
  var limit = req.body.limit;
  if(limit == undefined)
    limit = 50;
  if(channel_key == IFTTT_CHANNEL_KEY)
  {
    res.json({data : pollTriggers(TRIGGER_TYPE_KITCHENSYNCIP , 1 , limit)});
    res.end();
  }
  else
  {
    var errors = [{message : "Invalid channel key!"}];
    res.status(401).json({errors : errors});
    res.end();
  }
});

app.post(IFTTT_PREFIX + "/triggers/kitchensyncip_2" , function(req , res , next){
  var channel_key = req.headers['ifttt-channel-key'];
  var limit = req.body.limit;
  if(limit == undefined)
    limit = 50;
  if(channel_key == IFTTT_CHANNEL_KEY)
  {
    res.json({data : pollTriggers(TRIGGER_TYPE_KITCHENSYNCIP , 2 , limit)});
    res.end();
  }
  else
  {
    var errors = [{message : "Invalid channel key!"}];
    res.status(401).json({errors : errors});
    res.end();
  }
});

app.post(IFTTT_PREFIX + "/triggers/kitchensyncip_3" , function(req , res , next){
  var channel_key = req.headers['ifttt-channel-key'];
  var limit = req.body.limit;
  if(limit == undefined)
    limit = 50;
  if(channel_key == IFTTT_CHANNEL_KEY)
  {
    res.json({data : pollTriggers(TRIGGER_TYPE_KITCHENSYNCIP , 3 , limit)});
    res.end();
  }
  else
  {
    var errors = [{message : "Invalid channel key!"}];
    res.status(401).json({errors : errors});
    res.end();
  }
});

app.post(IFTTT_PREFIX + "/triggers/kitchensyncip_4" , function(req , res , next){
  var channel_key = req.headers['ifttt-channel-key'];
  var limit = req.body.limit;
  if(limit == undefined)
    limit = 50;
  if(channel_key == IFTTT_CHANNEL_KEY)
  {
    res.json({data : pollTriggers(TRIGGER_TYPE_KITCHENSYNCIP , 4 , limit)});
    res.end();
  }
  else
  {
    var errors = [{message : "Invalid channel key!"}];
    res.status(401).json({errors : errors});
    res.end();
  }
});

app.post(IFTTT_PREFIX + "/triggers/kitchensyncip_5" , function(req , res , next){
  var channel_key = req.headers['ifttt-channel-key'];
  var limit = req.body.limit;
  if(limit == undefined)
    limit = 50;
  if(channel_key == IFTTT_CHANNEL_KEY)
  {
    res.json({data : pollTriggers(TRIGGER_TYPE_KITCHENSYNCIP , 5 , limit)});
    res.end();
  }
  else
  {
    var errors = [{message : "Invalid channel key!"}];
    res.status(401).json({errors : errors});
    res.end();
  }
});

app.post(IFTTT_PREFIX + "/triggers/kitchensyncip_6" , function(req , res , next){
  var channel_key = req.headers['ifttt-channel-key'];
  var limit = req.body.limit;
  if(limit == undefined)
    limit = 50;
  if(channel_key == IFTTT_CHANNEL_KEY)
  {
    res.json({data : pollTriggers(TRIGGER_TYPE_KITCHENSYNCIP , 6 , limit)});
    res.end();
  }
  else
  {
    var errors = [{message : "Invalid channel key!"}];
    res.status(401).json({errors : errors});
    res.end();
  }
});

app.post(IFTTT_PREFIX + "/triggers/kitchensyncip_7" , function(req , res , next){
  var channel_key = req.headers['ifttt-channel-key'];
  var limit = req.body.limit;
  if(limit == undefined)
    limit = 50;
  if(channel_key == IFTTT_CHANNEL_KEY)
  {
    res.json({data : pollTriggers(TRIGGER_TYPE_KITCHENSYNCIP , 7 , limit)});
    res.end();
  }
  else
  {
    var errors = [{message : "Invalid channel key!"}];
    res.status(401).json({errors : errors});
    res.end();
  }
});

app.post(IFTTT_PREFIX + "/triggers/kitchensyncip_8" , function(req , res , next){
  var channel_key = req.headers['ifttt-channel-key'];
  var limit = req.body.limit;
  if(limit == undefined)
    limit = 50;
  if(channel_key == IFTTT_CHANNEL_KEY)
  {
    res.json({data : pollTriggers(TRIGGER_TYPE_KITCHENSYNCIP , 8 , limit)});
    res.end();  
  }
  else
  {
    var errors = [{message : "Invalid channel key!"}];
    res.status(401).json({errors : errors});
    res.end();
  }
});

app.post(IFTTT_PREFIX + "/triggers/kitchensyncip_9" , function(req , res , next){
  var channel_key = req.headers['ifttt-channel-key'];
  var limit = req.body.limit;
  if(limit == undefined)
    limit = 50;
  if(channel_key == IFTTT_CHANNEL_KEY)
  {
    res.json({data : pollTriggers(TRIGGER_TYPE_KITCHENSYNCIP , 9 , limit)});
    res.end();
  }
  else
  {
    var errors = [{message : "Invalid channel key!"}];
    res.status(401).json({errors : errors});
    res.end();
  }
});

app.post(IFTTT_PREFIX + "/triggers/kitchensyncip_10" , function(req , res , next){
  var channel_key = req.headers['ifttt-channel-key'];
  var limit = req.body.limit;
  if(limit == undefined)
    limit = 50;
  if(channel_key == IFTTT_CHANNEL_KEY)
  {
    res.json({data : pollTriggers(TRIGGER_TYPE_KITCHENSYNCIP , 10 , limit)});
    res.end();
  }
  else
  {
    var errors = [{message : "Invalid channel key!"}];
    res.status(401).json({errors : errors});
    res.end();
  }
});

//pushing actions..........................................................
app.post(IFTTT_PREFIX + "/actions/ptzoptics_1" , function(req , res , next){
  var channel_key = req.headers['ifttt-channel-key'];
  if(channel_key == IFTTT_CHANNEL_KEY)
  {
    if(req.body.actionFields == undefined)
    {
      var errors = [{message : "No Action Fields" , status : "SKIP"}];
      res.status(400).json({errors : errors});
      res.end();
      return;
    }
    var cam_ip = req.body.actionFields.ptzoptics_camera_ipdynamic_dns;
    if(cam_ip == undefined)
    {
      var errors = [{message : "No Camera Ip" , status : "SKIP"}];
      res.status(400).json({errors : errors});
      res.end();
      return;
    }
    var action_id = pushAction(cam_ip , 1);
    res.json({data : [{id : action_id}]});
    res.end();
  }
  else
  {
    var errors = [{message : "Invalid channel key!" , status : "SKIP"}];
    res.status(401).json({errors : errors});
    res.end();
  }
});

app.post(IFTTT_PREFIX + "/actions/ptzoptics_2" , function(req , res , next){
  var channel_key = req.headers['ifttt-channel-key'];
  if(channel_key == IFTTT_CHANNEL_KEY)
  {
    if(req.body.actionFields == undefined)
    {
      var errors = [{message : "No Action Fields" , status : "SKIP"}];
      res.status(400).json({errors : errors});
      res.end();
      return;
    }
    var cam_ip = req.body.actionFields.ptzoptics_camera_ipdynamic_dns;
    if(cam_ip == undefined)
    {
      var errors = [{message : "No Camera Ip" , status : "SKIP"}];
      res.status(400).json({errors : errors});
      res.end();
      return;
    }
    var action_id = pushAction(cam_ip , 2);
    res.json({data : [{id : action_id}]});
    res.end();
  }
  else
  {
    var errors = [{message : "Invalid channel key!" , status : "SKIP"}];
    res.status(401).json({errors : errors});
    res.end();
  }
});

app.post(IFTTT_PREFIX + "/actions/ptzoptics_3" , function(req , res , next){
  var channel_key = req.headers['ifttt-channel-key'];
  if(channel_key == IFTTT_CHANNEL_KEY)
  {
    if(req.body.actionFields == undefined)
    {
      var errors = [{message : "No Action Fields" , status : "SKIP"}];
      res.status(400).json({errors : errors});
      res.end();
      return;
    }
    var cam_ip = req.body.actionFields.ptzoptics_camera_ipdynamic_dns;
    if(cam_ip == undefined)
    {
      var errors = [{message : "No Camera Ip" , status : "SKIP"}];
      res.status(400).json({errors : errors});
      res.end();
      return;
    }
    var action_id = pushAction(cam_ip , 3);
    res.json({data : [{id : action_id}]});
    res.end();
  }
  else
  {
    var errors = [{message : "Invalid channel key!" , status : "SKIP"}];
    res.status(401).json({errors : errors});
    res.end();
  }
});

app.post(IFTTT_PREFIX + "/actions/ptzoptics_4" , function(req , res , next){
  var channel_key = req.headers['ifttt-channel-key'];
  if(channel_key == IFTTT_CHANNEL_KEY)
  {
    if(req.body.actionFields == undefined)
    {
      var errors = [{message : "No Action Fields" , status : "SKIP"}];
      res.status(400).json({errors : errors});
      res.end();
      return;
    }
    var cam_ip = req.body.actionFields.ptzoptics_camera_ipdynamic_dns;
    if(cam_ip == undefined)
    {
      var errors = [{message : "No Camera Ip" , status : "SKIP"}];
      res.status(400).json({errors : errors});
      res.end();
      return;
    }
    var action_id = pushAction(cam_ip , 4);
    res.json({data : [{id : action_id}]});
    res.end();
  }
  else
  {
    var errors = [{message : "Invalid channel key!" , status : "SKIP"}];
    res.status(401).json({errors : errors});
    res.end();
  }
});

app.post(IFTTT_PREFIX + "/actions/ptzoptics_5" , function(req , res , next){
  var channel_key = req.headers['ifttt-channel-key'];
  if(channel_key == IFTTT_CHANNEL_KEY)
  {
    if(req.body.actionFields == undefined)
    {
      var errors = [{message : "No Action Fields" , status : "SKIP"}];
      res.status(400).json({errors : errors});
      res.end();
      return;
    }
    var cam_ip = req.body.actionFields.ptzoptics_camera_ipdynamic_dns;
    if(cam_ip == undefined)
    {
      var errors = [{message : "No Camera Ip" , status : "SKIP"}];
      res.status(400).json({errors : errors});
      res.end();
      return;
    }
    var action_id = pushAction(cam_ip , 5);
    res.json({data : [{id : action_id}]});
    res.end();
  }
  else
  {
    var errors = [{message : "Invalid channel key!" , status : "SKIP"}];
    res.status(401).json({errors : errors});
    res.end();
  }
});

app.post(IFTTT_PREFIX + "/actions/ptzoptics_6" , function(req , res , next){
  var channel_key = req.headers['ifttt-channel-key'];
  if(channel_key == IFTTT_CHANNEL_KEY)
  {
    if(req.body.actionFields == undefined)
    {
      var errors = [{message : "No Action Fields" , status : "SKIP"}];
      res.status(400).json({errors : errors});
      res.end();
      return;
    }
    var cam_ip = req.body.actionFields.ptzoptics_camera_ipdynamic_dns;
    if(cam_ip == undefined)
    {
      var errors = [{message : "No Camera Ip" , status : "SKIP"}];
      res.status(400).json({errors : errors});
      res.end();
      return;
    }
    var action_id = pushAction(cam_ip , 6);
    res.json({data : [{id : action_id}]});
    res.end();
  }
  else
  {
    var errors = [{message : "Invalid channel key!" , status : "SKIP"}];
    res.status(401).json({errors : errors});
    res.end();
  }
});
// app.get('/.well-known/acme-challenge/jf3yVPshyDOl2ioRNxQBk5vSK1lDqdCHN6hY8mndaNQ' , function(req, res, next){
//  res.send('jf3yVPshyDOl2ioRNxQBk5vSK1lDqdCHN6hY8mndaNQ.ft69-x_H9d3pV8MEuvXDv5_nl3_eW3EKQC5M26U6pCg');
// })
/*********************************************************************************************/

var httpsServer = https.createServer(options, app).listen(HTTPS_PORT_NUM, function () {
  console.log('IFTTT PTZOPTICS CAMERA HTTPS SERVICE HAS CREATED -', ip.address() , HTTPS_PORT_NUM , 'AT' , new Date());
});

// var httpServer = http.createServer(app).listen(80 , function(){
//  console.log('IFTTT PTZOPTICS CAMERA HTTP SERVICE HAS CREATED-' , ip.address() , 80);
// });

setInterval(function(){
  var firstAction = actionQue.firstObject;
  if(firstAction != undefined)
    firstAction.execute();
  actionQue.removeFirst();
} , ACTION_EXECUTION_FREQUENCY);