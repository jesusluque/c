let videoWidth, videoHeight;
let viewportWidth, viewportHeight;

let streaming = false;

let animContainer = document.getElementById('anim');
let overlay = document.getElementById('overlay');
let video = document.getElementById('video');
let canvasOutput = document.getElementById('canvasOutput');
let canvasOutputCtx = canvasOutput.getContext('2d');
let stream = null;

var config = {
  
  tracking: {
    minimumSize: 0, // minimum screen width or height of the detected logos to launch menu, range [0-1]
    framesUntilLaunch: 3,
    ignore: false
  },

  animation: {
    loadingPath: 'assets/VW_LOGO_ANIM_SHORT.json',
    menuPath: 'assets/menu.json',
    loop: true,
    autoplay: true,
    animation: null
  }

}

var state = {
  trackingIsReady: false,
  isAnimOn: false,
  currentAnim: null,
  alreadyUnloaded: false,
  foundLogo: false,
  logoOnCurrentFrame: false,
  elapsedFrames: 0,
  positiveFrames: 0
};

function loadLoading(){
  console.log('loading Load Screen');
  overlay.style.display = 'none';
  loadAnim(config.animation.loadingPath);
}

function loadMenu(){
  console.log('loading Menu');
  config.tracking.ignore = true;
  overlay.style.display = 'block';
  loadAnim(config.animation.menuPath);
}

function unloadAnim()
{
  if(state.isAnimOn)
  {
    config.animation.animation.stop();
    config.animation.animation.destroy();
  }

  animContainer.style.display = 'none';
  state.isAnimOn = false;

}

function loadAnim(anim)
{
  unloadAnim();

  animContainer.style.display = 'block';

  config.animation.animation = bodymovin.loadAnimation({
    container: animContainer, // Required
    path: anim, // Required
    renderer: 'svg',// 'svg/canvas/html', // Required
    loop: config.animation.loop, // Optional
    autoplay: config.animation.autoplay, // Optional
    name: "Animation", // Name for future reference. Optional.
  });

  state.currentAnim = anim;

  config.animation.animation.addEventListener('loopComplete', function(){
    if((state.currentAnim == config.animation.loadingPath) && (state.trackingIsReady) && !state.alreadyUnloaded)
    {
      console.log('fired!');
      console.log('currentAnim',state.currentAnim);
      console.log('trackingIsReady',state.trackingIsReady);
      console.log('alreadyUnloaded',state.alreadyUnloaded);
      unloadAnim();
      state.alreadyUnloaded = true;
      overlay.style.display = 'none';
    }
  });
  
  state.isAnimOn = true;

}

function startCamera() {
  if (streaming) return;
  navigator.mediaDevices.getUserMedia({
    video: {
      facingMode: { ideal: "environment" },
      width: { ideal: 1920 },
      height: { ideal: 1080 }
    },
    audio: false})
    .then(function(s) {
    stream = s;
    video.setAttribute("playsinline", "true");
    video.setAttribute("muted", "true");
    video.setAttribute("autoplay", "true");
    video.srcObject = s;
    video.play();
  })
    .catch(function(err) {
    console.log("An error occured! " + err);
  });

  video.addEventListener("canplay", function(ev){
    if (!streaming) {
      videoWidth = video.videoWidth;
      videoHeight = video.videoHeight;
      video.setAttribute("width", videoWidth);
      video.setAttribute("height", videoHeight);

      if (typeof window.innerWidth != 'undefined') {
        viewportWidth = window.innerWidth;
        viewportHeight = window.innerHeight;
      }

      canvasOutput.width = viewportWidth;
      canvasOutput.height = viewportHeight;
      streaming = true;

      //unloadAnim();
      //overlay.style.display = 'none';
    }
    startVideoProcessing();
  }, false);
}

let logoClassifier = null;

let src = null;
let dstC1 = null;
let dstC3 = null;
let dstC4 = null;

let canvasInput = null;
let canvasInputCtx = null;

let canvasBuffer = null;
let canvasBufferCtx = null;

function startVideoProcessing() {
  if (!streaming) { console.warn("Please startup your webcam"); return; }
  stopVideoProcessing();
  canvasInput = document.createElement('canvas');
  canvasInput.width = videoWidth;
  canvasInput.height = videoHeight;
  canvasInputCtx = canvasInput.getContext('2d');
  
  canvasBuffer = document.createElement('canvas');
  canvasBuffer.width = videoWidth;
  canvasBuffer.height = videoHeight;
  canvasBufferCtx = canvasBuffer.getContext('2d');
  
  srcMat = new cv.Mat(videoHeight, videoWidth, cv.CV_8UC4);
  grayMat = new cv.Mat(videoHeight, videoWidth, cv.CV_8UC1);
  
  logoClassifier = new cv.CascadeClassifier();
  logoClassifier.load('vw.xml');
  
  requestAnimationFrame(processVideo);
}

function processVideo() {

  canvasInputCtx.drawImage(video, 0, 0, videoWidth, videoHeight);
  let imageData = canvasInputCtx.getImageData(0, 0, videoWidth, videoHeight);
  srcMat.data.set(imageData.data);
  cv.cvtColor(srcMat, grayMat, cv.COLOR_RGBA2GRAY);
  let logos = [];
  let bigLogos = [];
  let size;

  let logoVect = new cv.RectVector();
  let logoMat = new cv.Mat();

  cv.pyrDown(grayMat, logoMat);
  cv.pyrDown(logoMat, logoMat);
  cv.pyrDown(logoMat, logoMat); // added down pyramid
  size = logoMat.size();

  logoClassifier.detectMultiScale(logoMat, logoVect);
  for (let i = 0; i < logoVect.size(); i++) {
    let logo = logoVect.get(i);
      
      console.log('logoMat.size: ', size);
      console.log('logo detected, apparent size x: ',logo.width/videoWidth);
      console.log('logo detected, apparent size y: ',logo.height/videoHeight);
      console.log('minimum apparent size: ',config.tracking.minimumSize);
    
    // only detect big logos
    // minimumSize divided by 8 because we have THREE pyrDown (image size / 2) operations.
    if(((logo.width/videoWidth)>=config.tracking.minimumSize/8)||((logo.height/videoHeight)>=config.tracking.minimumSize/8))
    {
     bigLogos.push(new cv.Rect(logo.x, logo.y, logo.width, logo.height));
    }
    else
    {
      logos.push(new cv.Rect(logo.x, logo.y, logo.width, logo.height));
    }
  }


  if(!config.tracking.ignore)
  {
    if(state.foundLogo)
    {
      state.elapsedFrames++;
    }

    if(bigLogos.length>0)
    {
      state.foundLogo = true;
      state.logoOnCurrentFrame = true;
      state.positiveFrames++;
    }
    else
    {
      state.logoOnCurrentFrame = false;
      state.positiveFrames = 0;
      state.elapsedFrames = 0;
    }

    if(state.positiveFrames >= config.tracking.framesUntilLaunch)
    {
      loadMenu();
    }
  }

  logoMat.delete();
  logoVect.delete();

  // small logos
  drawResults(canvasOutputCtx, logos, '#00afe9', size, false, true);
  // big logos
  drawResults(canvasOutputCtx, bigLogos, '#00afe9', size, true, false);
  requestAnimationFrame(processVideo);
}

function drawResults(ctx, results, color, size, keepCanvas, drawCircles) {

  if(keepCanvas !== true)
  {
    ctx.clearRect(0, 0, viewportWidth, viewportHeight);
  }

  for (let i = 0; i < results.length; ++i) {
    let rect = results[i];
    let xRatio = (video.width/size.width) * (viewportWidth/video.width);
    let yRatio = (video.height/size.height) * (viewportHeight/video.height);
    
    if(drawCircles !== true)
    {
      ctx.lineWidth = 5;
      ctx.strokeStyle = color;
      ctx.strokeRect(rect.x*xRatio, rect.y*yRatio, rect.width*xRatio, rect.height*yRatio);

      var safew = rect.width*0.2*xRatio;
      var safeh = rect.height*0.2*yRatio;
      ctx.lineWidth=1;
      ctx.clearRect(rect.x*xRatio+safew,rect.y*yRatio-15,rect.width*xRatio*0.6,rect.height*yRatio+35);
      ctx.clearRect(rect.x*xRatio-15,rect.y*yRatio+safeh,rect.width*xRatio+35,rect.height*yRatio*0.6);
    }
    else
    {
      var nx, ny, nr = 0;
      nx = rect.x + rect.width/2;
      ny = rect.y + rect.height/2;
      nr = Math.max(rect.width*xRatio/2, rect.height*yRatio/2);
      
      ctx.lineWidth = 2;
      ctx.strokeStyle = color;
      ctx.beginPath();
      ctx.arc(nx*xRatio,ny*yRatio,nr,0,2*Math.PI); // full circle;
      ctx.stroke();
    }
  }
}

function stopVideoProcessing() {
  if (src != null && !src.isDeleted()) src.delete();
  if (dstC1 != null && !dstC1.isDeleted()) dstC1.delete();
  if (dstC3 != null && !dstC3.isDeleted()) dstC3.delete();
  if (dstC4 != null && !dstC4.isDeleted()) dstC4.delete();
}

function stopCamera() {
  if (!streaming) return;
  stopVideoProcessing();
  document.getElementById("canvasOutput").getContext("2d").clearRect(0, 0, width, height);
  video.pause();
  video.srcObject=null;
  stream.getVideoTracks()[0].stop();
  streaming = false;
}

function trackingIsReady() {
  console.log('Ready');
  state.trackingIsReady = true;
  startCamera();
}

function tooltip(msg)
{
  document.getElementById('status').innerHTML = msg;
  console.log(msg);
}


// http://www.seabreezecomputers.com/tips/copy2clipboard.htm
function select_all_and_copy() 
{

  var el = document.getElementById('url');
  el.innerHTML = window.location.href;

    // Copy textarea, pre, div, etc.
  if (document.body.createTextRange) {
        // IE 
        var textRange = document.body.createTextRange();
        textRange.moveToElementText(el);
        textRange.select();
        textRange.execCommand("Copy");   
        tooltip("URL copiada al portapapeles");  
    }
  else if (window.getSelection && document.createRange) {
        // non-IE
        var editable = el.contentEditable; // Record contentEditable status of element
        var readOnly = el.readOnly; // Record readOnly status of element
        el.contentEditable = true; // iOS will only select text on non-form elements if contentEditable = true;
        el.readOnly = false; // iOS will not select in a read only form element
        var range = document.createRange();
        range.selectNodeContents(el);
        var sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(range); // Does not work for Firefox if a textarea or input
        if (el.nodeName == "TEXTAREA" || el.nodeName == "INPUT") 
          el.select(); // Firefox will only select a form element with select()
        if (el.setSelectionRange && navigator.userAgent.match(/ipad|ipod|iphone/i))
          el.setSelectionRange(0, 999999); // iOS only selects "form" elements with SelectionRange
        el.contentEditable = editable; // Restore previous contentEditable status
        el.readOnly = readOnly; // Restore previous readOnly status 
      if (document.queryCommandSupported("copy"))
      {
      var successful = document.execCommand('copy');  
        if (successful) tooltip("URL copiada al portapapeles");
        else tooltip("Copia la dirección URL");
    }
    else
    {
      if (!navigator.userAgent.match(/ipad|ipod|iphone|android|silk/i))
        tooltip("Copia la dirección URL");
    }
    }
} // end function select_all_and_copy(el) 



// set current URL
document.getElementById('url').innerHTML = window.location.href;

if(adapter.browserDetails.browser == "Not a supported browser.")
{

  /*
  alert(adapter.browserDetails.browser + " " + adapter.browserDetails.version);
  alert('webkitGetUserMedia: ' + (window.navigator.webkitGetUserMedia ? 'true': 'false'));
  alert('webkitRTC: ' + (window.webkitRTCPeerConnection ? 'true': 'false'));
  alert('mediaDevices: ' + (window.mediaDevices ? 'true': 'false'));
  */

  document.getElementById('notcompatible').style.display = 'block';

}
else
{
  loadLoading();
}