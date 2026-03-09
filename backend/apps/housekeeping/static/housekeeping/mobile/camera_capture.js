(function () {
  var MAX_BYTES = 300 * 1024;
  var MAX_WIDTH = 1280;
  var MAX_HEIGHT = 1280;
  var THUMB_MAX = 300;

  function isLocalhost(hostname) {
    return hostname === "localhost" || hostname === "127.0.0.1";
  }

  function formatSize(bytes) {
    if (!bytes && bytes !== 0) return "";
    if (bytes < 1024) return bytes + " B";
    var kb = bytes / 1024;
    if (kb < 1024) return kb.toFixed(0) + " KB";
    return (kb / 1024).toFixed(2) + " MB";
  }

  function dataUrlToImage(dataUrl) {
    return new Promise(function (resolve, reject) {
      var img = new Image();
      img.onload = function () {
        resolve(img);
      };
      img.onerror = reject;
      img.src = dataUrl;
    });
  }

  function blobToDataUrl(blob) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onload = function () {
        resolve(reader.result);
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }

  function canvasToBlob(canvas, quality) {
    return new Promise(function (resolve) {
      canvas.toBlob(
        function (blob) {
          resolve(blob);
        },
        "image/jpeg",
        quality
      );
    });
  }

  async function compressImageBlob(originalBlob) {
    var originalUrl = await blobToDataUrl(originalBlob);
    var image = await dataUrlToImage(originalUrl);

    var width = image.naturalWidth || image.width;
    var height = image.naturalHeight || image.height;
    if (!width || !height) {
      return {
        blob: originalBlob,
        width: 0,
        height: 0,
        quality: 0.85,
        compressed: false,
        originalSize: originalBlob.size || 0,
        compressedSize: originalBlob.size || 0,
        savedPercent: 0,
        format: "jpeg",
      };
    }

    var scale = Math.min(1, MAX_WIDTH / width, MAX_HEIGHT / height);
    var targetWidth = Math.max(1, Math.round(width * scale));
    var targetHeight = Math.max(1, Math.round(height * scale));

    var canvas = document.createElement("canvas");
    canvas.width = targetWidth;
    canvas.height = targetHeight;
    var ctx = canvas.getContext("2d");
    ctx.drawImage(image, 0, 0, targetWidth, targetHeight);

    var bestBlob = null;
    var bestQuality = 0.85;
    for (var quality = 0.85; quality >= 0.35; quality -= 0.05) {
      // eslint-disable-next-line no-await-in-loop
      var outBlob = await canvasToBlob(canvas, quality);
      if (!outBlob) continue;
      bestBlob = outBlob;
      bestQuality = quality;
      if (outBlob.size <= MAX_BYTES) break;
    }

    if (!bestBlob) {
      return {
        blob: originalBlob,
        width: targetWidth,
        height: targetHeight,
        quality: 0.85,
        compressed: false,
        originalSize: originalBlob.size || 0,
        compressedSize: originalBlob.size || 0,
        savedPercent: 0,
        format: "jpeg",
      };
    }
    if (bestBlob.size > originalBlob.size) {
      return {
        blob: originalBlob,
        width: targetWidth,
        height: targetHeight,
        quality: 0.85,
        compressed: false,
        originalSize: originalBlob.size || 0,
        compressedSize: originalBlob.size || 0,
        savedPercent: 0,
        format: "jpeg",
      };
    }
    var originalSize = originalBlob.size || 0;
    var compressedSize = bestBlob.size || 0;
    var savedPercent = 0;
    if (originalSize > 0 && compressedSize < originalSize) {
      savedPercent = Math.round((1 - compressedSize / originalSize) * 100);
    }
    return {
      blob: bestBlob,
      width: targetWidth,
      height: targetHeight,
      quality: bestQuality,
      compressed: bestBlob !== originalBlob,
      originalSize: originalSize,
      compressedSize: compressedSize,
      savedPercent: savedPercent,
      format: "jpeg",
    };
  }

  async function generateThumbnailBlob(sourceBlob) {
    try {
      var src = await blobToDataUrl(sourceBlob);
      var image = await dataUrlToImage(src);
      var width = image.naturalWidth || image.width;
      var height = image.naturalHeight || image.height;
      if (!width || !height) return null;
      var scale = Math.min(1, THUMB_MAX / width, THUMB_MAX / height);
      var targetWidth = Math.max(1, Math.round(width * scale));
      var targetHeight = Math.max(1, Math.round(height * scale));
      var canvas = document.createElement("canvas");
      canvas.width = targetWidth;
      canvas.height = targetHeight;
      var ctx = canvas.getContext("2d");
      ctx.drawImage(image, 0, 0, targetWidth, targetHeight);
      return await canvasToBlob(canvas, 0.7);
    } catch (e) {
      return null;
    }
  }

  function CameraCapture(options) {
    this.options = options || {};
    this.permissionState = "prompt";
    this.stream = null;
    this.modalOpen = false;
    this.currentFacingMode = "environment";
    this.supportsFlip = false;
    this.currentTask = null;
    this.currentPreviewUrl = "";
    this.capturedBlob = null;
    this.capturedAt = null;
    this.captureMeta = null;
    this._build();
  }

  CameraCapture.prototype._build = function () {
    var root = document.createElement("div");
    root.style.position = "fixed";
    root.style.inset = "0";
    root.style.zIndex = "10060";
    root.style.display = "none";
    root.style.background = "rgba(2,6,23,.82)";
    root.innerHTML =
      '<div style="position:relative;width:100%;height:100%;display:flex;align-items:center;justify-content:center;padding:12px">' +
      '<div class="hk-camera-panel" style="position:relative;background:#0f172a;border-radius:16px;width:min(860px,100%);height:min(92vh,100%);overflow:hidden;border:1px solid rgba(255,255,255,.12)">' +
      '<div class="hk-camera-task" style="position:absolute;top:10px;left:10px;right:10px;z-index:8;background:rgba(15,23,42,.66);color:#fff;padding:8px 10px;border-radius:10px;font-size:12px;font-weight:700">Task photo</div>' +
      '<div class="hk-camera-prompt" style="position:absolute;inset:0;display:none;align-items:center;justify-content:center;padding:16px;z-index:7">' +
      '<div style="max-width:500px;background:#fff;border-radius:12px;padding:16px;border:1px solid #e5e7eb">' +
      '<div style="font-size:16px;font-weight:800;color:#111827">Camera permission required</div>' +
      '<div style="font-size:13px;color:#4b5563;margin-top:6px">This feature needs camera access to capture task photos.</div>' +
      '<div class="hk-camera-prompt-error" style="display:none;margin-top:8px;background:#fee2e2;border:1px solid #fca5a5;color:#991b1b;padding:8px;border-radius:8px;font-size:12px"></div>' +
      '<div style="display:flex;gap:8px;justify-content:flex-end;margin-top:12px">' +
      '<button type="button" class="hk-camera-cancel" style="border:none;background:#e5e7eb;color:#1f2937;border-radius:8px;padding:8px 11px;font-size:12px;font-weight:700;cursor:pointer">Cancel</button>' +
      '<button type="button" class="hk-camera-allow" style="border:none;background:#2d4a3e;color:#fff;border-radius:8px;padding:8px 11px;font-size:12px;font-weight:700;cursor:pointer">Allow Camera</button>' +
      "</div></div></div>" +
      '<div class="hk-camera-denied" style="position:absolute;inset:0;display:none;align-items:center;justify-content:center;padding:16px;z-index:7">' +
      '<div style="max-width:560px;background:#fff;border-radius:12px;padding:16px;border:1px solid #e5e7eb">' +
      '<div style="font-size:16px;font-weight:800;color:#991b1b">Camera access denied</div>' +
      '<div style="font-size:13px;color:#374151;margin-top:6px">Camera access is blocked. To enable:</div>' +
      '<ul style="margin:8px 0 0 18px;color:#4b5563;font-size:12px;line-height:1.45"><li>Chrome Android: lock icon -> Permissions -> Camera -> Allow</li><li>Safari iOS: Settings -> Safari -> Camera -> Allow</li></ul>' +
      '<div style="display:flex;gap:8px;justify-content:flex-end;margin-top:12px">' +
      '<button type="button" class="hk-camera-open-settings" style="border:none;background:#dbeafe;color:#1d4ed8;border-radius:8px;padding:8px 11px;font-size:12px;font-weight:700;cursor:pointer">Open Settings Help</button>' +
      '<button type="button" class="hk-camera-retry" style="border:none;background:#2d4a3e;color:#fff;border-radius:8px;padding:8px 11px;font-size:12px;font-weight:700;cursor:pointer">Try Again</button>' +
      "</div></div></div>" +
      '<div class="hk-camera-unsupported" style="position:absolute;inset:0;display:none;align-items:center;justify-content:center;padding:16px;z-index:7">' +
      '<div style="max-width:520px;background:#fff;border-radius:12px;padding:16px;border:1px solid #e5e7eb">' +
      '<div class="hk-camera-unsupported-title" style="font-size:16px;font-weight:800;color:#92400e">Camera unavailable</div>' +
      '<div class="hk-camera-unsupported-msg" style="font-size:13px;color:#4b5563;margin-top:6px">Camera is unavailable on this device/browser.</div>' +
      '<div style="display:flex;gap:8px;justify-content:flex-end;margin-top:12px">' +
      '<button type="button" class="hk-camera-cancel-unsupported" style="border:none;background:#e5e7eb;color:#1f2937;border-radius:8px;padding:8px 11px;font-size:12px;font-weight:700;cursor:pointer">Close</button>' +
      "</div></div></div>" +
      '<div class="hk-camera-live" style="position:absolute;inset:0;background:#000;display:none">' +
      '<video class="hk-camera-video" playsinline autoplay muted style="width:100%;height:100%;object-fit:cover"></video>' +
      '<div style="position:absolute;inset:0;pointer-events:none;opacity:.22"><div style="position:absolute;left:33.333%;top:0;bottom:0;width:1px;background:#fff"></div><div style="position:absolute;left:66.666%;top:0;bottom:0;width:1px;background:#fff"></div><div style="position:absolute;left:0;right:0;top:33.333%;height:1px;background:#fff"></div><div style="position:absolute;left:0;right:0;top:66.666%;height:1px;background:#fff"></div></div>' +
      '<div class="hk-camera-flash" style="position:absolute;inset:0;background:#fff;opacity:0;pointer-events:none;transition:opacity .15s"></div>' +
      '<span class="hk-camera-hd" style="position:absolute;right:12px;top:54px;display:none;background:rgba(0,0,0,.5);color:#fff;padding:3px 7px;border-radius:20px;font-size:10px;font-weight:800">HD</span>' +
      "</div>" +
      '<div class="hk-camera-preview" style="position:absolute;inset:0;background:#0f172a;display:none">' +
      '<img class="hk-camera-preview-img" alt="Preview" style="width:100%;height:76%;object-fit:contain;background:#000">' +
      '<div style="padding:10px 12px;color:#fff;height:24%;overflow:auto"><div class="hk-camera-preview-meta" style="font-size:12px;color:#cbd5e1"></div><div class="hk-camera-preview-size" style="font-size:12px;color:#cbd5e1;margin-top:2px"></div><div class="hk-camera-preview-compression" style="font-size:12px;color:#86efac;margin-top:2px"></div>' +
      '<div style="margin-top:7px"><label style="display:block;color:#e2e8f0;font-size:11px;font-weight:700;margin-bottom:4px">Add caption (optional)</label><input type="text" class="hk-camera-caption" maxlength="220" placeholder="Optional photo caption" style="width:100%;padding:9px 10px;border:1px solid #334155;border-radius:8px;background:#0b1220;color:#fff;font-size:12px"></div>' +
      '<div style="display:flex;gap:8px;margin-top:8px"><button type="button" class="hk-camera-retake" style="flex:1;border:none;background:#e5e7eb;color:#1f2937;border-radius:9px;padding:10px;font-size:12px;font-weight:800;cursor:pointer">Retake</button><button type="button" class="hk-camera-use" style="flex:1;border:none;background:#16a34a;color:#fff;border-radius:9px;padding:10px;font-size:12px;font-weight:800;cursor:pointer">Use Photo</button></div>' +
      "</div></div>" +
      '<button type="button" class="hk-camera-close" style="position:absolute;left:10px;top:10px;z-index:9;width:34px;height:34px;border:none;border-radius:999px;background:rgba(15,23,42,.7);color:#fff;font-size:18px;font-weight:700;cursor:pointer">x</button>' +
      '<button type="button" class="hk-camera-flip" style="position:absolute;right:10px;top:10px;z-index:9;display:none;border:none;border-radius:999px;background:rgba(15,23,42,.7);color:#fff;font-size:12px;font-weight:700;padding:9px 10px;cursor:pointer">Flip</button>' +
      '<button type="button" class="hk-camera-shutter" style="position:absolute;left:50%;bottom:16px;transform:translateX(-50%);z-index:9;display:none;width:72px;height:72px;border-radius:999px;border:5px solid rgba(255,255,255,.92);background:rgba(255,255,255,.18);cursor:pointer"></button>' +
      "</div></div>";

    document.body.appendChild(root);
    this.root = root;
    this.panel = root.querySelector(".hk-camera-panel");
    this.taskTitleEl = root.querySelector(".hk-camera-task");
    this.promptLayer = root.querySelector(".hk-camera-prompt");
    this.promptError = root.querySelector(".hk-camera-prompt-error");
    this.deniedLayer = root.querySelector(".hk-camera-denied");
    this.unsupportedLayer = root.querySelector(".hk-camera-unsupported");
    this.unsupportedTitle = root.querySelector(".hk-camera-unsupported-title");
    this.unsupportedMsg = root.querySelector(".hk-camera-unsupported-msg");
    this.liveLayer = root.querySelector(".hk-camera-live");
    this.previewLayer = root.querySelector(".hk-camera-preview");
    this.video = root.querySelector(".hk-camera-video");
    this.shutterBtn = root.querySelector(".hk-camera-shutter");
    this.flipBtn = root.querySelector(".hk-camera-flip");
    this.flashEl = root.querySelector(".hk-camera-flash");
    this.hdBadge = root.querySelector(".hk-camera-hd");
    this.previewImg = root.querySelector(".hk-camera-preview-img");
    this.previewMeta = root.querySelector(".hk-camera-preview-meta");
    this.previewSize = root.querySelector(".hk-camera-preview-size");
    this.previewCompression = root.querySelector(".hk-camera-preview-compression");
    this.captionInput = root.querySelector(".hk-camera-caption");

    var self = this;
    root.querySelector(".hk-camera-close").addEventListener("click", function () {
      self.close();
    });
    root.querySelector(".hk-camera-cancel").addEventListener("click", function () {
      self.close();
    });
    root.querySelector(".hk-camera-cancel-unsupported").addEventListener("click", function () {
      self.close();
    });
    root.querySelector(".hk-camera-allow").addEventListener("click", function () {
      self.requestPermissionAndStart();
    });
    root.querySelector(".hk-camera-retry").addEventListener("click", function () {
      self.requestPermissionAndStart();
    });
    root.querySelector(".hk-camera-open-settings").addEventListener("click", function () {
      self.openSettingsHelp();
    });
    this.shutterBtn.addEventListener("click", function () {
      self.capture();
    });
    this.flipBtn.addEventListener("click", function () {
      self.flipCamera();
    });
    root.querySelector(".hk-camera-retake").addEventListener("click", function () {
      self.showLive();
    });
    root.querySelector(".hk-camera-use").addEventListener("click", function () {
      self.usePhoto();
    });
    this.video.addEventListener("click", function () {
      self.tryTapFocus();
    });
    this.video.addEventListener("loadedmetadata", function () {
      self.updateHDBadge();
    });
    document.addEventListener("keydown", function (e) {
      if (!self.modalOpen) return;
      if (e.key === "Escape") self.close();
    });
  };

  CameraCapture.prototype.isMobile = function () {
    return /android|iphone|ipad|ipod|mobile/i.test(navigator.userAgent || "") || window.innerWidth < 768;
  };

  CameraCapture.prototype.isSecureForCamera = function () {
    if (window.isSecureContext) return true;
    return isLocalhost(window.location.hostname);
  };

  CameraCapture.prototype.isOpen = function () {
    return this.modalOpen;
  };

  CameraCapture.prototype.setLayer = function (name) {
    var map = {
      prompt: { el: this.promptLayer, mode: "flex" },
      denied: { el: this.deniedLayer, mode: "flex" },
      unsupported: { el: this.unsupportedLayer, mode: "flex" },
      live: { el: this.liveLayer, mode: "block" },
      preview: { el: this.previewLayer, mode: "block" },
    };
    Object.keys(map).forEach(function (key) {
      var item = map[key];
      if (!item || !item.el) return;
      item.el.style.display = key === name ? item.mode : "none";
    });
    this.shutterBtn.style.display = name === "live" ? "block" : "none";
    this.flipBtn.style.display = name === "live" && this.supportsFlip ? "inline-block" : "none";
  };

  CameraCapture.prototype.open = function (taskConfig) {
    this.currentTask = taskConfig || {};
    this.currentFacingMode = this.currentTask.facingMode || "environment";
    this.modalOpen = true;
    this.root.style.display = "block";
    if (this.isMobile()) {
      this.panel.style.width = "100%";
      this.panel.style.height = "100%";
      this.panel.style.maxWidth = "100%";
      this.panel.style.maxHeight = "100%";
      this.panel.style.borderRadius = "0";
    } else {
      this.panel.style.width = "min(860px,100%)";
      this.panel.style.height = "min(92vh,100%)";
      this.panel.style.borderRadius = "16px";
    }
    this.taskTitleEl.textContent = "Task: " + (this.currentTask.taskName || "Task");
    this.promptError.style.display = "none";
    this.promptError.textContent = "";
    this.captionInput.value = "";
    if (!this.isSecureForCamera()) {
      this.showUnsupported("Secure connection required", "Camera requires secure connection (HTTPS).");
      return;
    }
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      this.showUnsupported("Camera not supported", "This browser does not support camera capture.");
      return;
    }
    this.setLayer("prompt");
  };

  CameraCapture.prototype.close = function () {
    this.stopStream();
    this.modalOpen = false;
    this.root.style.display = "none";
    this.setLayer("prompt");
    this.clearPreview();
  };

  CameraCapture.prototype.showUnsupported = function (title, message) {
    this.unsupportedTitle.textContent = title || "Camera unavailable";
    this.unsupportedMsg.textContent = message || "Camera is unavailable on this device/browser.";
    this.setLayer("unsupported");
  };

  CameraCapture.prototype.requestPermissionAndStart = async function () {
    this.promptError.style.display = "none";
    this.promptError.textContent = "";
    if (!this.isSecureForCamera()) {
      this.showUnsupported("Secure connection required", "Camera requires secure connection (HTTPS).");
      return;
    }
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      this.showUnsupported("Camera not supported", "This browser does not support camera capture.");
      return;
    }
    try {
      await this.startCamera();
      this.permissionState = "granted";
      this.showLive();
    } catch (err) {
      var name = err && err.name ? err.name : "";
      if (name === "NotAllowedError" || name === "SecurityError") {
        this.permissionState = "denied";
        this.setLayer("denied");
      } else if (name === "NotReadableError") {
        this.showUnsupported("Camera busy", "Camera is in use by another app. Please close it and try again.");
      } else if (name === "NotFoundError" || name === "DevicesNotFoundError" || name === "OverconstrainedError") {
        this.showUnsupported("No camera found", "No usable camera detected on this device.");
      } else {
        this.promptError.style.display = "block";
        this.promptError.textContent = "Unable to access camera. Please try again.";
        this.setLayer("prompt");
      }
    }
  };

  CameraCapture.prototype.startCamera = async function () {
    this.stopStream();
    this.stream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: { ideal: this.currentFacingMode },
        width: { ideal: 1920 },
        height: { ideal: 1080 },
      },
      audio: false,
    });
    this.video.srcObject = this.stream;
    await this.video.play();
    this.supportsFlip = false;
    try {
      var devices = await navigator.mediaDevices.enumerateDevices();
      var cameraCount = devices.filter(function (d) {
        return d.kind === "videoinput";
      }).length;
      this.supportsFlip = cameraCount > 1;
    } catch (e) {
      this.supportsFlip = false;
    }
  };

  CameraCapture.prototype.showLive = function () {
    var self = this;
    if (!this.stream) {
      this.startCamera()
        .then(function () {
          self.setLayer("live");
        })
        .catch(function () {
          self.showUnsupported("Camera unavailable", "Unable to start camera. Please try again.");
        });
      return;
    }
    this.setLayer("live");
  };

  CameraCapture.prototype.flipCamera = async function () {
    this.currentFacingMode = this.currentFacingMode === "environment" ? "user" : "environment";
    try {
      await this.startCamera();
      this.showLive();
    } catch (err) {
      this.showUnsupported("Unable to switch camera", "Could not switch camera right now.");
    }
  };

  CameraCapture.prototype.tryTapFocus = async function () {
    if (!this.stream) return;
    var tracks = this.stream.getVideoTracks();
    if (!tracks.length) return;
    var track = tracks[0];
    if (!track.applyConstraints) return;
    try {
      await track.applyConstraints({ advanced: [{ focusMode: "single-shot" }] });
    } catch (e) {
      // Not supported on all devices.
    }
  };

  CameraCapture.prototype.updateHDBadge = function () {
    var videoWidth = this.video.videoWidth || 0;
    var videoHeight = this.video.videoHeight || 0;
    var hd = videoWidth >= 1920 || videoHeight >= 1080;
    this.hdBadge.style.display = hd ? "inline-block" : "none";
  };

  CameraCapture.prototype.capture = async function () {
    if (!this.stream || !this.video.videoWidth || !this.video.videoHeight) return;
    var canvas = document.createElement("canvas");
    canvas.width = this.video.videoWidth;
    canvas.height = this.video.videoHeight;
    var ctx = canvas.getContext("2d");
    ctx.drawImage(this.video, 0, 0, canvas.width, canvas.height);
    var self = this;
    this.flashEl.style.opacity = "0.95";
    setTimeout(function () {
      self.flashEl.style.opacity = "0";
    }, 150);
    var rawBlob = await canvasToBlob(canvas, 0.85);
    if (!rawBlob) return;
    // stop camera only after current frame has been converted to blob
    this.stopStream();
    this.capturedAt = new Date();
    try {
      this.captureMeta = await compressImageBlob(rawBlob);
      this.capturedBlob = this.captureMeta.blob || rawBlob;
      this.captureMeta.thumbnailBlob = await generateThumbnailBlob(this.capturedBlob);
      this.captureMeta.thumbnailSize = this.captureMeta.thumbnailBlob ? this.captureMeta.thumbnailBlob.size : 0;
    } catch (e) {
      this.captureMeta = {
        blob: rawBlob,
        width: canvas.width,
        height: canvas.height,
        quality: 0.85,
        compressed: false,
        originalSize: rawBlob.size || 0,
        compressedSize: rawBlob.size || 0,
        savedPercent: 0,
        format: "jpeg",
        thumbnailBlob: null,
        thumbnailSize: 0,
      };
      this.capturedBlob = rawBlob;
    }
    this.renderPreview();
  };

  CameraCapture.prototype.clearPreview = function () {
    if (this.currentPreviewUrl) {
      URL.revokeObjectURL(this.currentPreviewUrl);
      this.currentPreviewUrl = "";
    }
    this.capturedBlob = null;
    this.capturedAt = null;
    this.captureMeta = null;
    this.previewImg.src = "";
    this.previewMeta.textContent = "";
    this.previewSize.textContent = "";
    if (this.previewCompression) this.previewCompression.textContent = "";
  };

  CameraCapture.prototype.renderPreview = function () {
    if (!this.capturedBlob) return;
    if (this.currentPreviewUrl) URL.revokeObjectURL(this.currentPreviewUrl);
    this.currentPreviewUrl = URL.createObjectURL(this.capturedBlob);
    this.previewImg.src = this.currentPreviewUrl;
    var stamp = this.capturedAt ? this.capturedAt.toLocaleString() : new Date().toLocaleString();
    this.previewMeta.textContent = "Captured: " + stamp;
    var originalSize = this.captureMeta && this.captureMeta.originalSize ? this.captureMeta.originalSize : this.capturedBlob.size;
    var compressedSize = this.captureMeta && this.captureMeta.compressedSize ? this.captureMeta.compressedSize : this.capturedBlob.size;
    this.previewSize.textContent = "Original: " + formatSize(originalSize) + " | Compressed: " + formatSize(compressedSize);
    if (this.previewCompression) {
      var savedPct = this.captureMeta && this.captureMeta.savedPercent ? this.captureMeta.savedPercent : 0;
      this.previewCompression.textContent = savedPct > 0 ? ("Saved: " + savedPct + "%") : "Already optimized";
    }
    this.setLayer("preview");
  };

  CameraCapture.prototype.usePhoto = function () {
    if (!this.capturedBlob || !this.currentTask || typeof this.currentTask.onUsePhoto !== "function") return;
    var stamp = this.capturedAt ? this.capturedAt : new Date();
    var ts = stamp.toISOString().replace(/[:.]/g, "-");
    var taskId = this.currentTask.taskId || "task";
    var fileName = "task-photo-" + taskId + "-" + ts + ".jpg";
    var file = new File([this.capturedBlob], fileName, { type: "image/jpeg", lastModified: Date.now() });
    var thumbnailFile = null;
    if (this.captureMeta && this.captureMeta.thumbnailBlob) {
      thumbnailFile = new File(
        [this.captureMeta.thumbnailBlob],
        "task-photo-" + taskId + "-" + ts + "-thumb.jpg",
        { type: "image/jpeg", lastModified: Date.now() }
      );
    }
    this.currentTask.onUsePhoto({
      file: file,
      thumbnailFile: thumbnailFile,
      captureMethod: "camera",
      capturedAt: stamp.toISOString(),
      fileSize: this.capturedBlob.size,
      originalSize: (this.captureMeta && this.captureMeta.originalSize) || this.capturedBlob.size,
      compressedSize: (this.captureMeta && this.captureMeta.compressedSize) || this.capturedBlob.size,
      thumbnailSize: (this.captureMeta && this.captureMeta.thumbnailSize) || 0,
      savedPercent: (this.captureMeta && this.captureMeta.savedPercent) || 0,
      format: (this.captureMeta && this.captureMeta.format) || "jpeg",
      caption: this.captionInput.value || "",
      meta: this.captureMeta || null,
    });
    this.close();
  };

  CameraCapture.prototype.stopStream = function () {
    if (this.stream) {
      this.stream.getTracks().forEach(function (track) {
        try {
          track.stop();
        } catch (e) {}
      });
      this.stream = null;
    }
    if (this.video) this.video.srcObject = null;
  };

  CameraCapture.prototype.openSettingsHelp = function () {
    var msg = "Enable camera permission from browser settings and try again.";
    if (/android/i.test(navigator.userAgent || "")) {
      msg = "Chrome Android: lock icon in address bar -> Permissions -> Camera -> Allow.";
    } else if (/iphone|ipad|ipod/i.test(navigator.userAgent || "")) {
      msg = "iOS Safari: Settings -> Safari -> Camera -> Allow.";
    }
    alert(msg);
  };

  window.HKCameraCapture = CameraCapture;
})();
