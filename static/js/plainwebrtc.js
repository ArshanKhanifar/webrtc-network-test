const NUM_FILE_CHANNELS = 1;
var conf = {iceServers: [{urls: []}]};
var pc = new RTCPeerConnection(conf);
var localStream, _fileChannels = [], context,source,
	_chatChannel,sendFileDom = {}, 
	recFileDom={},receiveBuffer=[],
	receivedSize=0,
	file,
	bytesPrev=0;

var ROLE = null, AUTOMATED = true;

const LOG_LEVELS = {
	DEBUG: 5,
	INFO: 4,
	WARNING: 3,
	ERROR: 2
};

var logger = {
	log_level: LOG_LEVELS.DEBUG,
	log: function(msg, level, label) {
		if (level <= this.log_level) {
			console.log(label, msg);
		}
	},
	info: function (msg) {
		return this.log(msg, LOG_LEVELS.INFO, "INFO");
	},
	debug: function (msg) {
		return this.log(msg, LOG_LEVELS.DEBUG, "DEBUG");
	},
	warning: function (msg) {
		return this.log(msg, LOG_LEVELS.WARNING, "WARNING");
	},
	error: function (msg) {
		return this.log(msg, LOG_LEVELS.ERROR, "ERROR");
	}
};

function errHandler(err){
	logger.error(err);
}

const ENDPOINTS = {
	GET_ROLE: 'get-role',
	OFFER: 'offer',
	ANSWER: 'answer'
};

const ROLES = {
	CALLER: "caller",
	RESPONDER: "responder"
};

function main() {
	if (!AUTOMATED) {
		return;
	}
	setStatusLoading();
	establishConnection().then(() => {});
}

main();

function httpPostJSON(url, data) {
	var xhr = new XMLHttpRequest();
	xhr.open("POST", url, true);
	xhr.setRequestHeader('Content-Type', 'application/json; charset=UTF-8');
	return new Promise((resolve, reject) => {
		xhr.send(JSON.stringify(data));
		xhr.onloadend = function (e) {
			resolve(e);
		};
		xhr.onerror = function (e) {
			reject(e);
		};
	})
}

function waitForAnswerAndProcessIt(frequency) {
	var answer = null;
	logger.debug("Awaiting Answer");
	return new Promise((resolve, reject) => {
		async function _check() {
			answer = await httpGetJSON(ENDPOINTS.ANSWER);
			if (isEmpty(answer)) {
				setTimeout(_check, frequency);
				return;
			}
			logger.debug("Got the answer!");
			logger.debug(answer);
			await pc.setRemoteDescription(answer);
			resolve(answer);
		}
		setTimeout(_check, frequency);
	});
}

function isEmpty(obj) {
	if (obj === null) {
		return true
	}
	return Object.keys(obj).length === 0 && obj.constructor === Object
}

async function establishConnection() {
	var response = httpGetJSON(ENDPOINTS.GET_ROLE);
	ROLE = response.role;
	if (ROLE == ROLES.CALLER) {
		connectionStatus.innerHTML = "Caller";
		await createWebRtcOffer();
		await waitForAnswerAndProcessIt(1000);
	} else {
		connectionStatus.innerHTML = "Responder";
		var offer = await httpGetJSON(ENDPOINTS.OFFER);
		logger.debug("Responder got offer!");
		logger.debug(offer);
		var answer = await processRemoteOfferAndGetAnswer(offer);
		logger.debug("Prepared an answer");
		logger.debug(answer);
	}
}

function httpGetJSON(theURL) {
	return JSON.parse(httpGet(theURL));
}


function httpGet(theUrl) {
	var xmlHttp = new XMLHttpRequest();
	xmlHttp.open( "GET", theUrl, false ); // false for synchronous request
	xmlHttp.send( null );
	return xmlHttp.responseText;
}

function sendMsg(){
	var text = sendTxt.value;
	chat.innerHTML = chat.innerHTML + "<pre class=sent>" + text + "</pre>";
	_chatChannel.send(text);
	sendTxt.value="";
	return false;
}

pc.ondatachannel = function(e){
	if(e.channel.label.includes("fileChannel")){
		logger.debug('fileChannel: ' + e.channel.label + ' Received -');
		logger.debug(e.channel);
		_fileChannels.push(e.channel);
		setupFileChannel(e.channel);
	}
	if(e.channel.label == "chatChannel"){
		logger.debug('chatChannel Received -');
		logger.debug(e);
		_chatChannel = e.channel;
		setupChatChannelHandlers(e.channel);
	}
};

pc.onicecandidate = async function(e) {
	var cand = e.candidate;
	if(!cand){
		var data = pc.localDescription;
		logger.debug(`iceGatheringState complete: ${data.sdp}`);
		localOffer.value = JSON.stringify(data);
		try {
			if (data.type === "offer") {
				var result = await httpPostJSON(ENDPOINTS.OFFER, data);
				logger.info("result of posting offer:" + result.target.response);
			} else {
				var result = await httpPostJSON(ENDPOINTS.ANSWER, data);
				logger.info("result of posting answer:" + result.target.response);
			}
		} catch (e) {
			logger.error("error posting offer:");
			logger.error(e);
		}
	} else {
		logger.info("candidate");
		logger.info(cand.candidate);
	}
};

function setStatusLoading() {
	connectionLoading.style.visibility = "";
	connectionSuccess.style.visibility = "hidden";
}

function setStatusLoaded() {
	connectionLoading.style.visibility = "hidden";
	connectionSuccess.style.visibility = "";
}

pc.oniceconnectionstatechange = async function() {
	logger.debug('iceconnectionstatechange: ' + pc.iceConnectionState);
	if (pc.iceConnectionState === "connected") {
		setStatusLoaded();
	}
};

pc.onaddstream = function(e){
	console.log('remote onaddstream', e.stream);
	remote.src = URL.createObjectURL(e.stream);
};

pc.onconnection = function(e){
	console.log('onconnection ',e);
};

async function processRemoteOfferAndGetAnswer(offer) {
	await pc.setRemoteDescription(offer);
	logger.debug('setRemoteDescription ok');
	var answer = await pc.createAnswer();
	logger.debug('createAnswer 200 ok');
	logger.debug(answer);
	await pc.setLocalDescription(answer);
	return answer;
}

remoteOfferGot.onclick = async function(){
	var secret = new RTCSessionDescription(JSON.parse(remoteOffer.value));
	if(secret.type == "offer"){
		await processRemoteOfferAndGetAnswer(secret);
	} else {
		await pc.setRemoteDescription(secret);
	}
};

localOfferSet.onclick = function(){
	createWebRtcOffer();
};

function setupChannels() {
	_chatChannel = pc.createDataChannel('chatChannel');
	for (var i = 0 ; i < NUM_FILE_CHANNELS; i++) {
		var channel = pc.createDataChannel('fileChannel-' + i);
		channel.chunk_counter = 0;
		_fileChannels.push(channel);
		setupFileChannel(channel);
	}
	setupChatChannelHandlers(_chatChannel);
}

async function createWebRtcOffer() {
	setupChannels();
	try {
		var des = await pc.createOffer();
		await pc.setLocalDescription(des);
		setTimeout(function(){
			if(pc.iceGatheringState == "complete"){
				return;
			}else{
				console.log('after GetherTimeout');
				localOffer.value = JSON.stringify(pc.localDescription);
			}
		},2000);
		console.log('setLocalDescription ok');
		return pc.localDescription;
	} catch (e) {
		console.error("error creating offer" , e);
	}
}

//File transfer
fileTransfer.onchange = function(e){
	var files = fileTransfer.files;
	if(files.length > 0){
		file=files[0];
		sendFileDom.name=file.name;
		sendFileDom.size=file.size;
		sendFileDom.type=file.type;
		sendFileDom.fileInfo="areYouReady";
		console.log(sendFileDom);	
	}else{
		console.log('No file selected');
	}
}

function sendFile(){
	if(!fileTransfer.value)return;
	var fileInfo = JSON.stringify(sendFileDom);
	fileInfo.size = fileInfo.size / _fileChannels.length;
	for (var i in _fileChannels) {
		channel = _fileChannels[i];
		if (channel.send) {
			console.log('file info sent from channel: ' + channel);
			channel.send(fileInfo);
		}
	}
}

function setupFileChannel(channel){
	channel.onopen = function(e) {
		console.log('file channel' + channel.label + ' is open:', e);
	};

	channel.onmessage = function(e) {
		// Figure out data type
		var type = Object.prototype.toString.call(e.data),data;
		if(type == "[object ArrayBuffer]"){
			data = e.data;
			receiveBuffer.push(data);
			receivedSize += data.byteLength;
			recFileProg.value = receivedSize;
			if(receivedSize == recFileDom.size){
				var received = new window.Blob(receiveBuffer);
				file_download.href=URL.createObjectURL(received);
				file_download.innerHTML="download";
				file_download.download = recFileDom.name;
				// rest
				receiveBuffer = [];
				receivedSize = 0;
				// clearInterval(window.timer);	
			}
		} else if(type == "[object String]") {
			data = JSON.parse(e.data);
		} else if(type == "[object Blob]") {
			data = e.data;
			file_download.href = URL.createObjectURL(data);
			file_download.innerHTML = "download";
			file_download.download = recFileDom.name;
		}

		// Handle initial msg exchange
		if(data.fileInfo){
			if(data.fileInfo == "areYouReady"){
				recFileDom = data;
				recFileProg.max=data.size;
				var sendData = JSON.stringify({fileInfo:"readyToReceive"});
				channel.send(sendData);
				// window.timer = setInterval(function(){
				// 	Stats();
				// },1000)
			} else if(data.fileInfo == "readyToReceive"){
				sendFileProg.max = sendFileDom.size;
				sendFileinChannel(channel);
			}
			console.log('_fileChannel: ', data.fileInfo);
		}	
	}

	_fileChannels.onclose = function(){
		console.log('file channel closed');
	}
}

function setupChatChannelHandlers(e){
	_chatChannel.onopen = function(e){
		console.log('chat channel is open',e);
	}

	_chatChannel.onmessage = function(e){
		chat.innerHTML = chat.innerHTML + "<pre>"+ e.data + "</pre>"
	}

	_chatChannel.onclose = function(){
		console.log('chat channel closed');
	}
}

function log_progress(progress, elapsed) {
	console.log("progress: " + progress);
	console.log("percentage: " + progress/sendFileDom.size * 100 + "%")
	console.log("rate: " + progress/elapsed/(1<<10) + "kB/s");
}

function log_rate(channel, progress, elapsed) {
	channel.chunk_counter += 1;
	channel.chunk_counter %= 2;
	if (!channel.chunk_counter) {
		console.log(channel.label + " rate: " + progress/elapsed + "B/s");
	}
}

function sendFileinChannel(channel){
  var chunkSize = 16384;
	var chunkSize = (1 << 10) * (1 << 4);
	var start = new Date().getTime();
  var sliceFile = function(offset) {
    var reader = new window.FileReader();
    reader.onload = (function() {
      return function(e) {
      	if (channel.readyState !== "open") {
					// window.setTimeout(sliceFile, 0, offset + chunkSize);
					return;
				}
      	//console.log('sending from: ' + channel.label);
        channel.send(e.target.result);
        if (file.size > offset + e.target.result.byteLength) {
          window.setTimeout(sliceFile, 0, offset + chunkSize);
        }
        var bytesRead = e.target.result.byteLength;
				var elapsed = new Date().getTime() - start;
				var progress = offset + bytesRead;
				sendFileProg.value = progress;
				//log_progress(progress, elapsed);
				log_rate(channel, progress, elapsed);
      };
    })(file);
    var slice = file.slice(offset, offset + chunkSize);
    reader.readAsArrayBuffer(slice);
  };
  sliceFile(0);
}

function Stats(){
	pc.getStats(null,function(stats){
    for (var key in stats) {
      var res = stats[key];
      console.log(res.type,res.googActiveConnection);
      if (res.type === 'googCandidatePair' &&
          res.googActiveConnection === 'true') {
        // calculate current bitrate
        var bytesNow = res.bytesReceived;
        console.log('bit rate', (bytesNow - bytesPrev));
        bytesPrev = bytesNow;
      }
    }
	});
}

streamAudioFile.onchange = function(){
	console.log('streamAudioFile');
	context = new AudioContext();
  var file = streamAudioFile.files[0];
  if (file) {
    if (file.type.match('audio*')) {
      var reader = new FileReader();
        reader.onload = (function(readEvent) {
          context.decodeAudioData(readEvent.target.result, function(buffer) {
            // create an audio source and connect it to the file buffer
            source = context.createBufferSource();
            source.buffer = buffer;
            source.start(0);
 
            // connect the audio stream to the audio hardware
            source.connect(context.destination);
 
            // create a destination for the remote browser
            var remote = context.createMediaStreamDestination();
 
            // connect the remote destination to the source
            source.connect(remote);
 
			 			local.srcObject = remote.stream
						local.muted=true;
            // add the stream to the peer connection
            pc.addStream(remote.stream);
 
            // create a SDP offer for the new stream
            // pc.createOffer(setLocalAndSendMessage);
          });
        });
 
      reader.readAsArrayBuffer(file);
    }
  }	
}

var audioRTC = function (cb){
  console.log('streamAudioFile');
  window.context = new AudioContext();
  var file = streamAudioFile.files[0];
  if (file) {
    if (file.type.match('audio*')) {
      var reader = new FileReader();
        reader.onload = (function(readEvent) {
          context.decodeAudioData(readEvent.target.result, function(buffer) {
            // create an audio source and connect it to the file buffer
            var source = context.createBufferSource();
            source.buffer = buffer;
            source.start(0);
  
            // connect the audio stream to the audio hardware
            source.connect(context.destination);
 
            // create a destination for the remote browser
            var remote = context.createMediaStreamDestination();
 
            // connect the remote destination to the source
            source.connect(remote);
            window.localStream = remote.stream;
            cb({'status':'success','stream':true});
          });
        });
 
      reader.readAsArrayBuffer(file);
    }
  } 
}
