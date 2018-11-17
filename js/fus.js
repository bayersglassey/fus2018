// The Module object: Our interface to the outside world. We import
// and export values on it. There are various ways Module can be used:
// 1. Not defined. We create it here
// 2. A function parameter, function(Module) { ..generated code.. }
// 3. pre-run appended it, var Module = {}; ..generated code..
// 4. External script tag defines var Module.
// We need to check if Module already exists (e.g. case 3 above).
// Substitution will be replaced with actual code on later stage of the build,
// this way Closure Compiler will not mangle it (e.g. case 4. above).
// Note that if you want to run closure, and also to use Module
// after the generated code, you will need to define   var Module = {};
// before the code. Then that object will be used in the code, and you
// can continue to use Module afterwards as well.
var Module = typeof Module !== 'undefined' ? Module : {};

// --pre-jses are emitted after the Module integration code, so that they can
// refer to Module (if they choose; they can also define Module)
// {{PRE_JSES}}

// Sometimes an existing Module object exists with properties
// meant to overwrite the default module functionality. Here
// we collect those properties and reapply _after_ we configure
// the current environment's defaults to avoid having to be so
// defensive during initialization.
var moduleOverrides = {};
var key;
for (key in Module) {
  if (Module.hasOwnProperty(key)) {
    moduleOverrides[key] = Module[key];
  }
}

Module['arguments'] = [];
Module['thisProgram'] = './this.program';
Module['quit'] = function(status, toThrow) {
  throw toThrow;
};
Module['preRun'] = [];
Module['postRun'] = [];

// The environment setup code below is customized to use Module.
// *** Environment setup code ***
var ENVIRONMENT_IS_WEB = false;
var ENVIRONMENT_IS_WORKER = false;
var ENVIRONMENT_IS_NODE = false;
var ENVIRONMENT_IS_SHELL = false;

// Three configurations we can be running in:
// 1) We could be the application main() thread running in the main JS UI thread. (ENVIRONMENT_IS_WORKER == false and ENVIRONMENT_IS_PTHREAD == false)
// 2) We could be the application main() thread proxied to worker. (with Emscripten -s PROXY_TO_WORKER=1) (ENVIRONMENT_IS_WORKER == true, ENVIRONMENT_IS_PTHREAD == false)
// 3) We could be an application pthread running in a worker. (ENVIRONMENT_IS_WORKER == true and ENVIRONMENT_IS_PTHREAD == true)

if (Module['ENVIRONMENT']) {
  if (Module['ENVIRONMENT'] === 'WEB') {
    ENVIRONMENT_IS_WEB = true;
  } else if (Module['ENVIRONMENT'] === 'WORKER') {
    ENVIRONMENT_IS_WORKER = true;
  } else if (Module['ENVIRONMENT'] === 'NODE') {
    ENVIRONMENT_IS_NODE = true;
  } else if (Module['ENVIRONMENT'] === 'SHELL') {
    ENVIRONMENT_IS_SHELL = true;
  } else {
    throw new Error('Module[\'ENVIRONMENT\'] value is not valid. must be one of: WEB|WORKER|NODE|SHELL.');
  }
} else {
  ENVIRONMENT_IS_WEB = typeof window === 'object';
  ENVIRONMENT_IS_WORKER = typeof importScripts === 'function';
  ENVIRONMENT_IS_NODE = typeof process === 'object' && typeof require === 'function' && !ENVIRONMENT_IS_WEB && !ENVIRONMENT_IS_WORKER;
  ENVIRONMENT_IS_SHELL = !ENVIRONMENT_IS_WEB && !ENVIRONMENT_IS_NODE && !ENVIRONMENT_IS_WORKER;
}


if (ENVIRONMENT_IS_NODE) {
  // Expose functionality in the same simple way that the shells work
  // Note that we pollute the global namespace here, otherwise we break in node
  var nodeFS;
  var nodePath;

  Module['read'] = function shell_read(filename, binary) {
    var ret;
    ret = tryParseAsDataURI(filename);
    if (!ret) {
      if (!nodeFS) nodeFS = require('fs');
      if (!nodePath) nodePath = require('path');
      filename = nodePath['normalize'](filename);
      ret = nodeFS['readFileSync'](filename);
    }
    return binary ? ret : ret.toString();
  };

  Module['readBinary'] = function readBinary(filename) {
    var ret = Module['read'](filename, true);
    if (!ret.buffer) {
      ret = new Uint8Array(ret);
    }
    assert(ret.buffer);
    return ret;
  };

  if (process['argv'].length > 1) {
    Module['thisProgram'] = process['argv'][1].replace(/\\/g, '/');
  }

  Module['arguments'] = process['argv'].slice(2);

  if (typeof module !== 'undefined') {
    module['exports'] = Module;
  }

  process['on']('uncaughtException', function(ex) {
    // suppress ExitStatus exceptions from showing an error
    if (!(ex instanceof ExitStatus)) {
      throw ex;
    }
  });
  // Currently node will swallow unhandled rejections, but this behavior is
  // deprecated, and in the future it will exit with error status.
  process['on']('unhandledRejection', function(reason, p) {
    Module['printErr']('node.js exiting due to unhandled promise rejection');
    process['exit'](1);
  });

  Module['inspect'] = function () { return '[Emscripten Module object]'; };
}
else if (ENVIRONMENT_IS_SHELL) {
  if (typeof read != 'undefined') {
    Module['read'] = function shell_read(f) {
      var data = tryParseAsDataURI(f);
      if (data) {
        return intArrayToString(data);
      }
      return read(f);
    };
  }

  Module['readBinary'] = function readBinary(f) {
    var data;
    data = tryParseAsDataURI(f);
    if (data) {
      return data;
    }
    if (typeof readbuffer === 'function') {
      return new Uint8Array(readbuffer(f));
    }
    data = read(f, 'binary');
    assert(typeof data === 'object');
    return data;
  };

  if (typeof scriptArgs != 'undefined') {
    Module['arguments'] = scriptArgs;
  } else if (typeof arguments != 'undefined') {
    Module['arguments'] = arguments;
  }

  if (typeof quit === 'function') {
    Module['quit'] = function(status, toThrow) {
      quit(status);
    }
  }
}
else if (ENVIRONMENT_IS_WEB || ENVIRONMENT_IS_WORKER) {
  Module['read'] = function shell_read(url) {
    try {
      var xhr = new XMLHttpRequest();
      xhr.open('GET', url, false);
      xhr.send(null);
      return xhr.responseText;
    } catch (err) {
      var data = tryParseAsDataURI(url);
      if (data) {
        return intArrayToString(data);
      }
      throw err;
    }
  };

  if (ENVIRONMENT_IS_WORKER) {
    Module['readBinary'] = function readBinary(url) {
      try {
        var xhr = new XMLHttpRequest();
        xhr.open('GET', url, false);
        xhr.responseType = 'arraybuffer';
        xhr.send(null);
        return new Uint8Array(xhr.response);
      } catch (err) {
        var data = tryParseAsDataURI(url);
        if (data) {
          return data;
        }
        throw err;
      }
    };
  }

  Module['readAsync'] = function readAsync(url, onload, onerror) {
    var xhr = new XMLHttpRequest();
    xhr.open('GET', url, true);
    xhr.responseType = 'arraybuffer';
    xhr.onload = function xhr_onload() {
      if (xhr.status == 200 || (xhr.status == 0 && xhr.response)) { // file URLs can return 0
        onload(xhr.response);
        return;
      }
      var data = tryParseAsDataURI(url);
      if (data) {
        onload(data.buffer);
        return;
      }
      onerror();
    };
    xhr.onerror = onerror;
    xhr.send(null);
  };

  if (typeof arguments != 'undefined') {
    Module['arguments'] = arguments;
  }

  Module['setWindowTitle'] = function(title) { document.title = title };
}
else {
  // Unreachable because SHELL is dependent on the others
  throw new Error('unknown runtime environment');
}

// console.log is checked first, as 'print' on the web will open a print dialogue
// printErr is preferable to console.warn (works better in shells)
// bind(console) is necessary to fix IE/Edge closed dev tools panel behavior.
Module['print'] = typeof console !== 'undefined' ? console.log.bind(console) : (typeof print !== 'undefined' ? print : null);
Module['printErr'] = typeof printErr !== 'undefined' ? printErr : ((typeof console !== 'undefined' && console.warn.bind(console)) || Module['print']);

// *** Environment setup code ***

// Closure helpers
Module.print = Module['print'];
Module.printErr = Module['printErr'];

// Merge back in the overrides
for (key in moduleOverrides) {
  if (moduleOverrides.hasOwnProperty(key)) {
    Module[key] = moduleOverrides[key];
  }
}
// Free the object hierarchy contained in the overrides, this lets the GC
// reclaim data used e.g. in memoryInitializerRequest, which is a large typed array.
moduleOverrides = undefined;



// {{PREAMBLE_ADDITIONS}}

var STACK_ALIGN = 16;

// stack management, and other functionality that is provided by the compiled code,
// should not be used before it is ready
stackSave = stackRestore = stackAlloc = setTempRet0 = getTempRet0 = function() {
  abort('cannot use the stack before compiled code is ready to run, and has provided stack access');
};

function staticAlloc(size) {
  assert(!staticSealed);
  var ret = STATICTOP;
  STATICTOP = (STATICTOP + size + 15) & -16;
  return ret;
}

function dynamicAlloc(size) {
  assert(DYNAMICTOP_PTR);
  var ret = HEAP32[DYNAMICTOP_PTR>>2];
  var end = (ret + size + 15) & -16;
  HEAP32[DYNAMICTOP_PTR>>2] = end;
  if (end >= TOTAL_MEMORY) {
    var success = enlargeMemory();
    if (!success) {
      HEAP32[DYNAMICTOP_PTR>>2] = ret;
      return 0;
    }
  }
  return ret;
}

function alignMemory(size, factor) {
  if (!factor) factor = STACK_ALIGN; // stack alignment (16-byte) by default
  var ret = size = Math.ceil(size / factor) * factor;
  return ret;
}

function getNativeTypeSize(type) {
  switch (type) {
    case 'i1': case 'i8': return 1;
    case 'i16': return 2;
    case 'i32': return 4;
    case 'i64': return 8;
    case 'float': return 4;
    case 'double': return 8;
    default: {
      if (type[type.length-1] === '*') {
        return 4; // A pointer
      } else if (type[0] === 'i') {
        var bits = parseInt(type.substr(1));
        assert(bits % 8 === 0);
        return bits / 8;
      } else {
        return 0;
      }
    }
  }
}

function warnOnce(text) {
  if (!warnOnce.shown) warnOnce.shown = {};
  if (!warnOnce.shown[text]) {
    warnOnce.shown[text] = 1;
    Module.printErr(text);
  }
}



var jsCallStartIndex = 1;
var functionPointers = new Array(0);

// 'sig' parameter is only used on LLVM wasm backend
function addFunction(func, sig) {
  if (typeof sig === 'undefined') {
    Module.printErr('Warning: addFunction: Provide a wasm function signature ' +
                    'string as a second argument');
  }
  var base = 0;
  for (var i = base; i < base + 0; i++) {
    if (!functionPointers[i]) {
      functionPointers[i] = func;
      return jsCallStartIndex + i;
    }
  }
  throw 'Finished up all reserved function pointers. Use a higher value for RESERVED_FUNCTION_POINTERS.';
}

function removeFunction(index) {
  functionPointers[index-jsCallStartIndex] = null;
}

var funcWrappers = {};

function getFuncWrapper(func, sig) {
  if (!func) return; // on null pointer, return undefined
  assert(sig);
  if (!funcWrappers[sig]) {
    funcWrappers[sig] = {};
  }
  var sigCache = funcWrappers[sig];
  if (!sigCache[func]) {
    // optimize away arguments usage in common cases
    if (sig.length === 1) {
      sigCache[func] = function dynCall_wrapper() {
        return dynCall(sig, func);
      };
    } else if (sig.length === 2) {
      sigCache[func] = function dynCall_wrapper(arg) {
        return dynCall(sig, func, [arg]);
      };
    } else {
      // general case
      sigCache[func] = function dynCall_wrapper() {
        return dynCall(sig, func, Array.prototype.slice.call(arguments));
      };
    }
  }
  return sigCache[func];
}


function makeBigInt(low, high, unsigned) {
  return unsigned ? ((+((low>>>0)))+((+((high>>>0)))*4294967296.0)) : ((+((low>>>0)))+((+((high|0)))*4294967296.0));
}

function dynCall(sig, ptr, args) {
  if (args && args.length) {
    assert(args.length == sig.length-1);
    assert(('dynCall_' + sig) in Module, 'bad function pointer type - no table for sig \'' + sig + '\'');
    return Module['dynCall_' + sig].apply(null, [ptr].concat(args));
  } else {
    assert(sig.length == 1);
    assert(('dynCall_' + sig) in Module, 'bad function pointer type - no table for sig \'' + sig + '\'');
    return Module['dynCall_' + sig].call(null, ptr);
  }
}


function getCompilerSetting(name) {
  throw 'You must build with -s RETAIN_COMPILER_SETTINGS=1 for getCompilerSetting or emscripten_get_compiler_setting to work';
}

var Runtime = {
  // FIXME backwards compatibility layer for ports. Support some Runtime.*
  //       for now, fix it there, then remove it from here. That way we
  //       can minimize any period of breakage.
  dynCall: dynCall, // for SDL2 port
  // helpful errors
  getTempRet0: function() { abort('getTempRet0() is now a top-level function, after removing the Runtime object. Remove "Runtime."') },
  staticAlloc: function() { abort('staticAlloc() is now a top-level function, after removing the Runtime object. Remove "Runtime."') },
  stackAlloc: function() { abort('stackAlloc() is now a top-level function, after removing the Runtime object. Remove "Runtime."') },
};

// The address globals begin at. Very low in memory, for code size and optimization opportunities.
// Above 0 is static memory, starting with globals.
// Then the stack.
// Then 'dynamic' memory for sbrk.
var GLOBAL_BASE = 8;



// === Preamble library stuff ===

// Documentation for the public APIs defined in this file must be updated in:
//    site/source/docs/api_reference/preamble.js.rst
// A prebuilt local version of the documentation is available at:
//    site/build/text/docs/api_reference/preamble.js.txt
// You can also build docs locally as HTML or other formats in site/
// An online HTML version (which may be of a different version of Emscripten)
//    is up at http://kripken.github.io/emscripten-site/docs/api_reference/preamble.js.html



//========================================
// Runtime essentials
//========================================

var ABORT = 0; // whether we are quitting the application. no code should run after this. set in exit() and abort()
var EXITSTATUS = 0;

/** @type {function(*, string=)} */
function assert(condition, text) {
  if (!condition) {
    abort('Assertion failed: ' + text);
  }
}

var globalScope = this;

// Returns the C function with a specified identifier (for C++, you need to do manual name mangling)
function getCFunc(ident) {
  var func = Module['_' + ident]; // closure exported function
  assert(func, 'Cannot call unknown function ' + ident + ', make sure it is exported');
  return func;
}

var JSfuncs = {
  // Helpers for cwrap -- it can't refer to Runtime directly because it might
  // be renamed by closure, instead it calls JSfuncs['stackSave'].body to find
  // out what the minified function name is.
  'stackSave': function() {
    stackSave()
  },
  'stackRestore': function() {
    stackRestore()
  },
  // type conversion from js to c
  'arrayToC' : function(arr) {
    var ret = stackAlloc(arr.length);
    writeArrayToMemory(arr, ret);
    return ret;
  },
  'stringToC' : function(str) {
    var ret = 0;
    if (str !== null && str !== undefined && str !== 0) { // null string
      // at most 4 bytes per UTF-8 code point, +1 for the trailing '\0'
      var len = (str.length << 2) + 1;
      ret = stackAlloc(len);
      stringToUTF8(str, ret, len);
    }
    return ret;
  }
};
// For fast lookup of conversion functions
var toC = {'string' : JSfuncs['stringToC'], 'array' : JSfuncs['arrayToC']};

// C calling interface.
function ccall (ident, returnType, argTypes, args, opts) {
  var func = getCFunc(ident);
  var cArgs = [];
  var stack = 0;
  assert(returnType !== 'array', 'Return type should not be "array".');
  if (args) {
    for (var i = 0; i < args.length; i++) {
      var converter = toC[argTypes[i]];
      if (converter) {
        if (stack === 0) stack = stackSave();
        cArgs[i] = converter(args[i]);
      } else {
        cArgs[i] = args[i];
      }
    }
  }
  var ret = func.apply(null, cArgs);
  if (returnType === 'string') ret = Pointer_stringify(ret);
  if (stack !== 0) {
    stackRestore(stack);
  }
  return ret;
}

function cwrap (ident, returnType, argTypes) {
  argTypes = argTypes || [];
  var cfunc = getCFunc(ident);
  // When the function takes numbers and returns a number, we can just return
  // the original function
  var numericArgs = argTypes.every(function(type){ return type === 'number'});
  var numericRet = returnType !== 'string';
  if (numericRet && numericArgs) {
    return cfunc;
  }
  return function() {
    return ccall(ident, returnType, argTypes, arguments);
  }
}

/** @type {function(number, number, string, boolean=)} */
function setValue(ptr, value, type, noSafe) {
  type = type || 'i8';
  if (type.charAt(type.length-1) === '*') type = 'i32'; // pointers are 32-bit
    switch(type) {
      case 'i1': HEAP8[((ptr)>>0)]=value; break;
      case 'i8': HEAP8[((ptr)>>0)]=value; break;
      case 'i16': HEAP16[((ptr)>>1)]=value; break;
      case 'i32': HEAP32[((ptr)>>2)]=value; break;
      case 'i64': (tempI64 = [value>>>0,(tempDouble=value,(+(Math_abs(tempDouble))) >= 1.0 ? (tempDouble > 0.0 ? ((Math_min((+(Math_floor((tempDouble)/4294967296.0))), 4294967295.0))|0)>>>0 : (~~((+(Math_ceil((tempDouble - +(((~~(tempDouble)))>>>0))/4294967296.0)))))>>>0) : 0)],HEAP32[((ptr)>>2)]=tempI64[0],HEAP32[(((ptr)+(4))>>2)]=tempI64[1]); break;
      case 'float': HEAPF32[((ptr)>>2)]=value; break;
      case 'double': HEAPF64[((ptr)>>3)]=value; break;
      default: abort('invalid type for setValue: ' + type);
    }
}

/** @type {function(number, string, boolean=)} */
function getValue(ptr, type, noSafe) {
  type = type || 'i8';
  if (type.charAt(type.length-1) === '*') type = 'i32'; // pointers are 32-bit
    switch(type) {
      case 'i1': return HEAP8[((ptr)>>0)];
      case 'i8': return HEAP8[((ptr)>>0)];
      case 'i16': return HEAP16[((ptr)>>1)];
      case 'i32': return HEAP32[((ptr)>>2)];
      case 'i64': return HEAP32[((ptr)>>2)];
      case 'float': return HEAPF32[((ptr)>>2)];
      case 'double': return HEAPF64[((ptr)>>3)];
      default: abort('invalid type for getValue: ' + type);
    }
  return null;
}

var ALLOC_NORMAL = 0; // Tries to use _malloc()
var ALLOC_STACK = 1; // Lives for the duration of the current function call
var ALLOC_STATIC = 2; // Cannot be freed
var ALLOC_DYNAMIC = 3; // Cannot be freed except through sbrk
var ALLOC_NONE = 4; // Do not allocate

// allocate(): This is for internal use. You can use it yourself as well, but the interface
//             is a little tricky (see docs right below). The reason is that it is optimized
//             for multiple syntaxes to save space in generated code. So you should
//             normally not use allocate(), and instead allocate memory using _malloc(),
//             initialize it with setValue(), and so forth.
// @slab: An array of data, or a number. If a number, then the size of the block to allocate,
//        in *bytes* (note that this is sometimes confusing: the next parameter does not
//        affect this!)
// @types: Either an array of types, one for each byte (or 0 if no type at that position),
//         or a single type which is used for the entire block. This only matters if there
//         is initial data - if @slab is a number, then this does not matter at all and is
//         ignored.
// @allocator: How to allocate memory, see ALLOC_*
/** @type {function((TypedArray|Array<number>|number), string, number, number=)} */
function allocate(slab, types, allocator, ptr) {
  var zeroinit, size;
  if (typeof slab === 'number') {
    zeroinit = true;
    size = slab;
  } else {
    zeroinit = false;
    size = slab.length;
  }

  var singleType = typeof types === 'string' ? types : null;

  var ret;
  if (allocator == ALLOC_NONE) {
    ret = ptr;
  } else {
    ret = [typeof _malloc === 'function' ? _malloc : staticAlloc, stackAlloc, staticAlloc, dynamicAlloc][allocator === undefined ? ALLOC_STATIC : allocator](Math.max(size, singleType ? 1 : types.length));
  }

  if (zeroinit) {
    var stop;
    ptr = ret;
    assert((ret & 3) == 0);
    stop = ret + (size & ~3);
    for (; ptr < stop; ptr += 4) {
      HEAP32[((ptr)>>2)]=0;
    }
    stop = ret + size;
    while (ptr < stop) {
      HEAP8[((ptr++)>>0)]=0;
    }
    return ret;
  }

  if (singleType === 'i8') {
    if (slab.subarray || slab.slice) {
      HEAPU8.set(/** @type {!Uint8Array} */ (slab), ret);
    } else {
      HEAPU8.set(new Uint8Array(slab), ret);
    }
    return ret;
  }

  var i = 0, type, typeSize, previousType;
  while (i < size) {
    var curr = slab[i];

    type = singleType || types[i];
    if (type === 0) {
      i++;
      continue;
    }
    assert(type, 'Must know what type to store in allocate!');

    if (type == 'i64') type = 'i32'; // special case: we have one i32 here, and one i32 later

    setValue(ret+i, curr, type);

    // no need to look up size unless type changes, so cache it
    if (previousType !== type) {
      typeSize = getNativeTypeSize(type);
      previousType = type;
    }
    i += typeSize;
  }

  return ret;
}

// Allocate memory during any stage of startup - static memory early on, dynamic memory later, malloc when ready
function getMemory(size) {
  if (!staticSealed) return staticAlloc(size);
  if (!runtimeInitialized) return dynamicAlloc(size);
  return _malloc(size);
}

/** @type {function(number, number=)} */
function Pointer_stringify(ptr, length) {
  if (length === 0 || !ptr) return '';
  // TODO: use TextDecoder
  // Find the length, and check for UTF while doing so
  var hasUtf = 0;
  var t;
  var i = 0;
  while (1) {
    assert(ptr + i < TOTAL_MEMORY);
    t = HEAPU8[(((ptr)+(i))>>0)];
    hasUtf |= t;
    if (t == 0 && !length) break;
    i++;
    if (length && i == length) break;
  }
  if (!length) length = i;

  var ret = '';

  if (hasUtf < 128) {
    var MAX_CHUNK = 1024; // split up into chunks, because .apply on a huge string can overflow the stack
    var curr;
    while (length > 0) {
      curr = String.fromCharCode.apply(String, HEAPU8.subarray(ptr, ptr + Math.min(length, MAX_CHUNK)));
      ret = ret ? ret + curr : curr;
      ptr += MAX_CHUNK;
      length -= MAX_CHUNK;
    }
    return ret;
  }
  return UTF8ToString(ptr);
}

// Given a pointer 'ptr' to a null-terminated ASCII-encoded string in the emscripten HEAP, returns
// a copy of that string as a Javascript String object.

function AsciiToString(ptr) {
  var str = '';
  while (1) {
    var ch = HEAP8[((ptr++)>>0)];
    if (!ch) return str;
    str += String.fromCharCode(ch);
  }
}

// Copies the given Javascript String object 'str' to the emscripten HEAP at address 'outPtr',
// null-terminated and encoded in ASCII form. The copy will require at most str.length+1 bytes of space in the HEAP.

function stringToAscii(str, outPtr) {
  return writeAsciiToMemory(str, outPtr, false);
}

// Given a pointer 'ptr' to a null-terminated UTF8-encoded string in the given array that contains uint8 values, returns
// a copy of that string as a Javascript String object.

var UTF8Decoder = typeof TextDecoder !== 'undefined' ? new TextDecoder('utf8') : undefined;
function UTF8ArrayToString(u8Array, idx) {
  var endPtr = idx;
  // TextDecoder needs to know the byte length in advance, it doesn't stop on null terminator by itself.
  // Also, use the length info to avoid running tiny strings through TextDecoder, since .subarray() allocates garbage.
  while (u8Array[endPtr]) ++endPtr;

  if (endPtr - idx > 16 && u8Array.subarray && UTF8Decoder) {
    return UTF8Decoder.decode(u8Array.subarray(idx, endPtr));
  } else {
    var u0, u1, u2, u3, u4, u5;

    var str = '';
    while (1) {
      // For UTF8 byte structure, see http://en.wikipedia.org/wiki/UTF-8#Description and https://www.ietf.org/rfc/rfc2279.txt and https://tools.ietf.org/html/rfc3629
      u0 = u8Array[idx++];
      if (!u0) return str;
      if (!(u0 & 0x80)) { str += String.fromCharCode(u0); continue; }
      u1 = u8Array[idx++] & 63;
      if ((u0 & 0xE0) == 0xC0) { str += String.fromCharCode(((u0 & 31) << 6) | u1); continue; }
      u2 = u8Array[idx++] & 63;
      if ((u0 & 0xF0) == 0xE0) {
        u0 = ((u0 & 15) << 12) | (u1 << 6) | u2;
      } else {
        u3 = u8Array[idx++] & 63;
        if ((u0 & 0xF8) == 0xF0) {
          u0 = ((u0 & 7) << 18) | (u1 << 12) | (u2 << 6) | u3;
        } else {
          u4 = u8Array[idx++] & 63;
          if ((u0 & 0xFC) == 0xF8) {
            u0 = ((u0 & 3) << 24) | (u1 << 18) | (u2 << 12) | (u3 << 6) | u4;
          } else {
            u5 = u8Array[idx++] & 63;
            u0 = ((u0 & 1) << 30) | (u1 << 24) | (u2 << 18) | (u3 << 12) | (u4 << 6) | u5;
          }
        }
      }
      if (u0 < 0x10000) {
        str += String.fromCharCode(u0);
      } else {
        var ch = u0 - 0x10000;
        str += String.fromCharCode(0xD800 | (ch >> 10), 0xDC00 | (ch & 0x3FF));
      }
    }
  }
}

// Given a pointer 'ptr' to a null-terminated UTF8-encoded string in the emscripten HEAP, returns
// a copy of that string as a Javascript String object.

function UTF8ToString(ptr) {
  return UTF8ArrayToString(HEAPU8,ptr);
}

// Copies the given Javascript String object 'str' to the given byte array at address 'outIdx',
// encoded in UTF8 form and null-terminated. The copy will require at most str.length*4+1 bytes of space in the HEAP.
// Use the function lengthBytesUTF8 to compute the exact number of bytes (excluding null terminator) that this function will write.
// Parameters:
//   str: the Javascript string to copy.
//   outU8Array: the array to copy to. Each index in this array is assumed to be one 8-byte element.
//   outIdx: The starting offset in the array to begin the copying.
//   maxBytesToWrite: The maximum number of bytes this function can write to the array. This count should include the null
//                    terminator, i.e. if maxBytesToWrite=1, only the null terminator will be written and nothing else.
//                    maxBytesToWrite=0 does not write any bytes to the output, not even the null terminator.
// Returns the number of bytes written, EXCLUDING the null terminator.

function stringToUTF8Array(str, outU8Array, outIdx, maxBytesToWrite) {
  if (!(maxBytesToWrite > 0)) // Parameter maxBytesToWrite is not optional. Negative values, 0, null, undefined and false each don't write out any bytes.
    return 0;

  var startIdx = outIdx;
  var endIdx = outIdx + maxBytesToWrite - 1; // -1 for string null terminator.
  for (var i = 0; i < str.length; ++i) {
    // Gotcha: charCodeAt returns a 16-bit word that is a UTF-16 encoded code unit, not a Unicode code point of the character! So decode UTF16->UTF32->UTF8.
    // See http://unicode.org/faq/utf_bom.html#utf16-3
    // For UTF8 byte structure, see http://en.wikipedia.org/wiki/UTF-8#Description and https://www.ietf.org/rfc/rfc2279.txt and https://tools.ietf.org/html/rfc3629
    var u = str.charCodeAt(i); // possibly a lead surrogate
    if (u >= 0xD800 && u <= 0xDFFF) u = 0x10000 + ((u & 0x3FF) << 10) | (str.charCodeAt(++i) & 0x3FF);
    if (u <= 0x7F) {
      if (outIdx >= endIdx) break;
      outU8Array[outIdx++] = u;
    } else if (u <= 0x7FF) {
      if (outIdx + 1 >= endIdx) break;
      outU8Array[outIdx++] = 0xC0 | (u >> 6);
      outU8Array[outIdx++] = 0x80 | (u & 63);
    } else if (u <= 0xFFFF) {
      if (outIdx + 2 >= endIdx) break;
      outU8Array[outIdx++] = 0xE0 | (u >> 12);
      outU8Array[outIdx++] = 0x80 | ((u >> 6) & 63);
      outU8Array[outIdx++] = 0x80 | (u & 63);
    } else if (u <= 0x1FFFFF) {
      if (outIdx + 3 >= endIdx) break;
      outU8Array[outIdx++] = 0xF0 | (u >> 18);
      outU8Array[outIdx++] = 0x80 | ((u >> 12) & 63);
      outU8Array[outIdx++] = 0x80 | ((u >> 6) & 63);
      outU8Array[outIdx++] = 0x80 | (u & 63);
    } else if (u <= 0x3FFFFFF) {
      if (outIdx + 4 >= endIdx) break;
      outU8Array[outIdx++] = 0xF8 | (u >> 24);
      outU8Array[outIdx++] = 0x80 | ((u >> 18) & 63);
      outU8Array[outIdx++] = 0x80 | ((u >> 12) & 63);
      outU8Array[outIdx++] = 0x80 | ((u >> 6) & 63);
      outU8Array[outIdx++] = 0x80 | (u & 63);
    } else {
      if (outIdx + 5 >= endIdx) break;
      outU8Array[outIdx++] = 0xFC | (u >> 30);
      outU8Array[outIdx++] = 0x80 | ((u >> 24) & 63);
      outU8Array[outIdx++] = 0x80 | ((u >> 18) & 63);
      outU8Array[outIdx++] = 0x80 | ((u >> 12) & 63);
      outU8Array[outIdx++] = 0x80 | ((u >> 6) & 63);
      outU8Array[outIdx++] = 0x80 | (u & 63);
    }
  }
  // Null-terminate the pointer to the buffer.
  outU8Array[outIdx] = 0;
  return outIdx - startIdx;
}

// Copies the given Javascript String object 'str' to the emscripten HEAP at address 'outPtr',
// null-terminated and encoded in UTF8 form. The copy will require at most str.length*4+1 bytes of space in the HEAP.
// Use the function lengthBytesUTF8 to compute the exact number of bytes (excluding null terminator) that this function will write.
// Returns the number of bytes written, EXCLUDING the null terminator.

function stringToUTF8(str, outPtr, maxBytesToWrite) {
  assert(typeof maxBytesToWrite == 'number', 'stringToUTF8(str, outPtr, maxBytesToWrite) is missing the third parameter that specifies the length of the output buffer!');
  return stringToUTF8Array(str, HEAPU8,outPtr, maxBytesToWrite);
}

// Returns the number of bytes the given Javascript string takes if encoded as a UTF8 byte array, EXCLUDING the null terminator byte.

function lengthBytesUTF8(str) {
  var len = 0;
  for (var i = 0; i < str.length; ++i) {
    // Gotcha: charCodeAt returns a 16-bit word that is a UTF-16 encoded code unit, not a Unicode code point of the character! So decode UTF16->UTF32->UTF8.
    // See http://unicode.org/faq/utf_bom.html#utf16-3
    var u = str.charCodeAt(i); // possibly a lead surrogate
    if (u >= 0xD800 && u <= 0xDFFF) u = 0x10000 + ((u & 0x3FF) << 10) | (str.charCodeAt(++i) & 0x3FF);
    if (u <= 0x7F) {
      ++len;
    } else if (u <= 0x7FF) {
      len += 2;
    } else if (u <= 0xFFFF) {
      len += 3;
    } else if (u <= 0x1FFFFF) {
      len += 4;
    } else if (u <= 0x3FFFFFF) {
      len += 5;
    } else {
      len += 6;
    }
  }
  return len;
}

// Given a pointer 'ptr' to a null-terminated UTF16LE-encoded string in the emscripten HEAP, returns
// a copy of that string as a Javascript String object.

var UTF16Decoder = typeof TextDecoder !== 'undefined' ? new TextDecoder('utf-16le') : undefined;
function UTF16ToString(ptr) {
  assert(ptr % 2 == 0, 'Pointer passed to UTF16ToString must be aligned to two bytes!');
  var endPtr = ptr;
  // TextDecoder needs to know the byte length in advance, it doesn't stop on null terminator by itself.
  // Also, use the length info to avoid running tiny strings through TextDecoder, since .subarray() allocates garbage.
  var idx = endPtr >> 1;
  while (HEAP16[idx]) ++idx;
  endPtr = idx << 1;

  if (endPtr - ptr > 32 && UTF16Decoder) {
    return UTF16Decoder.decode(HEAPU8.subarray(ptr, endPtr));
  } else {
    var i = 0;

    var str = '';
    while (1) {
      var codeUnit = HEAP16[(((ptr)+(i*2))>>1)];
      if (codeUnit == 0) return str;
      ++i;
      // fromCharCode constructs a character from a UTF-16 code unit, so we can pass the UTF16 string right through.
      str += String.fromCharCode(codeUnit);
    }
  }
}

// Copies the given Javascript String object 'str' to the emscripten HEAP at address 'outPtr',
// null-terminated and encoded in UTF16 form. The copy will require at most str.length*4+2 bytes of space in the HEAP.
// Use the function lengthBytesUTF16() to compute the exact number of bytes (excluding null terminator) that this function will write.
// Parameters:
//   str: the Javascript string to copy.
//   outPtr: Byte address in Emscripten HEAP where to write the string to.
//   maxBytesToWrite: The maximum number of bytes this function can write to the array. This count should include the null
//                    terminator, i.e. if maxBytesToWrite=2, only the null terminator will be written and nothing else.
//                    maxBytesToWrite<2 does not write any bytes to the output, not even the null terminator.
// Returns the number of bytes written, EXCLUDING the null terminator.

function stringToUTF16(str, outPtr, maxBytesToWrite) {
  assert(outPtr % 2 == 0, 'Pointer passed to stringToUTF16 must be aligned to two bytes!');
  assert(typeof maxBytesToWrite == 'number', 'stringToUTF16(str, outPtr, maxBytesToWrite) is missing the third parameter that specifies the length of the output buffer!');
  // Backwards compatibility: if max bytes is not specified, assume unsafe unbounded write is allowed.
  if (maxBytesToWrite === undefined) {
    maxBytesToWrite = 0x7FFFFFFF;
  }
  if (maxBytesToWrite < 2) return 0;
  maxBytesToWrite -= 2; // Null terminator.
  var startPtr = outPtr;
  var numCharsToWrite = (maxBytesToWrite < str.length*2) ? (maxBytesToWrite / 2) : str.length;
  for (var i = 0; i < numCharsToWrite; ++i) {
    // charCodeAt returns a UTF-16 encoded code unit, so it can be directly written to the HEAP.
    var codeUnit = str.charCodeAt(i); // possibly a lead surrogate
    HEAP16[((outPtr)>>1)]=codeUnit;
    outPtr += 2;
  }
  // Null-terminate the pointer to the HEAP.
  HEAP16[((outPtr)>>1)]=0;
  return outPtr - startPtr;
}

// Returns the number of bytes the given Javascript string takes if encoded as a UTF16 byte array, EXCLUDING the null terminator byte.

function lengthBytesUTF16(str) {
  return str.length*2;
}

function UTF32ToString(ptr) {
  assert(ptr % 4 == 0, 'Pointer passed to UTF32ToString must be aligned to four bytes!');
  var i = 0;

  var str = '';
  while (1) {
    var utf32 = HEAP32[(((ptr)+(i*4))>>2)];
    if (utf32 == 0)
      return str;
    ++i;
    // Gotcha: fromCharCode constructs a character from a UTF-16 encoded code (pair), not from a Unicode code point! So encode the code point to UTF-16 for constructing.
    // See http://unicode.org/faq/utf_bom.html#utf16-3
    if (utf32 >= 0x10000) {
      var ch = utf32 - 0x10000;
      str += String.fromCharCode(0xD800 | (ch >> 10), 0xDC00 | (ch & 0x3FF));
    } else {
      str += String.fromCharCode(utf32);
    }
  }
}

// Copies the given Javascript String object 'str' to the emscripten HEAP at address 'outPtr',
// null-terminated and encoded in UTF32 form. The copy will require at most str.length*4+4 bytes of space in the HEAP.
// Use the function lengthBytesUTF32() to compute the exact number of bytes (excluding null terminator) that this function will write.
// Parameters:
//   str: the Javascript string to copy.
//   outPtr: Byte address in Emscripten HEAP where to write the string to.
//   maxBytesToWrite: The maximum number of bytes this function can write to the array. This count should include the null
//                    terminator, i.e. if maxBytesToWrite=4, only the null terminator will be written and nothing else.
//                    maxBytesToWrite<4 does not write any bytes to the output, not even the null terminator.
// Returns the number of bytes written, EXCLUDING the null terminator.

function stringToUTF32(str, outPtr, maxBytesToWrite) {
  assert(outPtr % 4 == 0, 'Pointer passed to stringToUTF32 must be aligned to four bytes!');
  assert(typeof maxBytesToWrite == 'number', 'stringToUTF32(str, outPtr, maxBytesToWrite) is missing the third parameter that specifies the length of the output buffer!');
  // Backwards compatibility: if max bytes is not specified, assume unsafe unbounded write is allowed.
  if (maxBytesToWrite === undefined) {
    maxBytesToWrite = 0x7FFFFFFF;
  }
  if (maxBytesToWrite < 4) return 0;
  var startPtr = outPtr;
  var endPtr = startPtr + maxBytesToWrite - 4;
  for (var i = 0; i < str.length; ++i) {
    // Gotcha: charCodeAt returns a 16-bit word that is a UTF-16 encoded code unit, not a Unicode code point of the character! We must decode the string to UTF-32 to the heap.
    // See http://unicode.org/faq/utf_bom.html#utf16-3
    var codeUnit = str.charCodeAt(i); // possibly a lead surrogate
    if (codeUnit >= 0xD800 && codeUnit <= 0xDFFF) {
      var trailSurrogate = str.charCodeAt(++i);
      codeUnit = 0x10000 + ((codeUnit & 0x3FF) << 10) | (trailSurrogate & 0x3FF);
    }
    HEAP32[((outPtr)>>2)]=codeUnit;
    outPtr += 4;
    if (outPtr + 4 > endPtr) break;
  }
  // Null-terminate the pointer to the HEAP.
  HEAP32[((outPtr)>>2)]=0;
  return outPtr - startPtr;
}

// Returns the number of bytes the given Javascript string takes if encoded as a UTF16 byte array, EXCLUDING the null terminator byte.

function lengthBytesUTF32(str) {
  var len = 0;
  for (var i = 0; i < str.length; ++i) {
    // Gotcha: charCodeAt returns a 16-bit word that is a UTF-16 encoded code unit, not a Unicode code point of the character! We must decode the string to UTF-32 to the heap.
    // See http://unicode.org/faq/utf_bom.html#utf16-3
    var codeUnit = str.charCodeAt(i);
    if (codeUnit >= 0xD800 && codeUnit <= 0xDFFF) ++i; // possibly a lead surrogate, so skip over the tail surrogate.
    len += 4;
  }

  return len;
}

// Allocate heap space for a JS string, and write it there.
// It is the responsibility of the caller to free() that memory.
function allocateUTF8(str) {
  var size = lengthBytesUTF8(str) + 1;
  var ret = _malloc(size);
  if (ret) stringToUTF8Array(str, HEAP8, ret, size);
  return ret;
}

// Allocate stack space for a JS string, and write it there.
function allocateUTF8OnStack(str) {
  var size = lengthBytesUTF8(str) + 1;
  var ret = stackAlloc(size);
  stringToUTF8Array(str, HEAP8, ret, size);
  return ret;
}

function demangle(func) {
  warnOnce('warning: build with  -s DEMANGLE_SUPPORT=1  to link in libcxxabi demangling');
  return func;
}

function demangleAll(text) {
  var regex =
    /__Z[\w\d_]+/g;
  return text.replace(regex,
    function(x) {
      var y = demangle(x);
      return x === y ? x : (x + ' [' + y + ']');
    });
}

function jsStackTrace() {
  var err = new Error();
  if (!err.stack) {
    // IE10+ special cases: It does have callstack info, but it is only populated if an Error object is thrown,
    // so try that as a special-case.
    try {
      throw new Error(0);
    } catch(e) {
      err = e;
    }
    if (!err.stack) {
      return '(no stack trace available)';
    }
  }
  return err.stack.toString();
}

function stackTrace() {
  var js = jsStackTrace();
  if (Module['extraStackTrace']) js += '\n' + Module['extraStackTrace']();
  return demangleAll(js);
}

// Memory management

var PAGE_SIZE = 16384;
var WASM_PAGE_SIZE = 65536;
var ASMJS_PAGE_SIZE = 16777216;
var MIN_TOTAL_MEMORY = 16777216;

function alignUp(x, multiple) {
  if (x % multiple > 0) {
    x += multiple - (x % multiple);
  }
  return x;
}

var HEAP,
/** @type {ArrayBuffer} */
  buffer,
/** @type {Int8Array} */
  HEAP8,
/** @type {Uint8Array} */
  HEAPU8,
/** @type {Int16Array} */
  HEAP16,
/** @type {Uint16Array} */
  HEAPU16,
/** @type {Int32Array} */
  HEAP32,
/** @type {Uint32Array} */
  HEAPU32,
/** @type {Float32Array} */
  HEAPF32,
/** @type {Float64Array} */
  HEAPF64;

function updateGlobalBuffer(buf) {
  Module['buffer'] = buffer = buf;
}

function updateGlobalBufferViews() {
  Module['HEAP8'] = HEAP8 = new Int8Array(buffer);
  Module['HEAP16'] = HEAP16 = new Int16Array(buffer);
  Module['HEAP32'] = HEAP32 = new Int32Array(buffer);
  Module['HEAPU8'] = HEAPU8 = new Uint8Array(buffer);
  Module['HEAPU16'] = HEAPU16 = new Uint16Array(buffer);
  Module['HEAPU32'] = HEAPU32 = new Uint32Array(buffer);
  Module['HEAPF32'] = HEAPF32 = new Float32Array(buffer);
  Module['HEAPF64'] = HEAPF64 = new Float64Array(buffer);
}

var STATIC_BASE, STATICTOP, staticSealed; // static area
var STACK_BASE, STACKTOP, STACK_MAX; // stack area
var DYNAMIC_BASE, DYNAMICTOP_PTR; // dynamic area handled by sbrk

  STATIC_BASE = STATICTOP = STACK_BASE = STACKTOP = STACK_MAX = DYNAMIC_BASE = DYNAMICTOP_PTR = 0;
  staticSealed = false;


// Initializes the stack cookie. Called at the startup of main and at the startup of each thread in pthreads mode.
function writeStackCookie() {
  assert((STACK_MAX & 3) == 0);
  HEAPU32[(STACK_MAX >> 2)-1] = 0x02135467;
  HEAPU32[(STACK_MAX >> 2)-2] = 0x89BACDFE;
}

function checkStackCookie() {
  if (HEAPU32[(STACK_MAX >> 2)-1] != 0x02135467 || HEAPU32[(STACK_MAX >> 2)-2] != 0x89BACDFE) {
    abort('Stack overflow! Stack cookie has been overwritten, expected hex dwords 0x89BACDFE and 0x02135467, but received 0x' + HEAPU32[(STACK_MAX >> 2)-2].toString(16) + ' ' + HEAPU32[(STACK_MAX >> 2)-1].toString(16));
  }
  // Also test the global address 0 for integrity. This check is not compatible with SAFE_SPLIT_MEMORY though, since that mode already tests all address 0 accesses on its own.
  if (HEAP32[0] !== 0x63736d65 /* 'emsc' */) throw 'Runtime error: The application has corrupted its heap memory area (address zero)!';
}

function abortStackOverflow(allocSize) {
  abort('Stack overflow! Attempted to allocate ' + allocSize + ' bytes on the stack, but stack has only ' + (STACK_MAX - stackSave() + allocSize) + ' bytes available!');
}

function abortOnCannotGrowMemory() {
  abort('Cannot enlarge memory arrays. Either (1) compile with  -s TOTAL_MEMORY=X  with X higher than the current value ' + TOTAL_MEMORY + ', (2) compile with  -s ALLOW_MEMORY_GROWTH=1  which allows increasing the size at runtime but prevents some optimizations, (3) set Module.TOTAL_MEMORY to a higher value before the program runs, or (4) if you want malloc to return NULL (0) instead of this abort, compile with  -s ABORTING_MALLOC=0 ');
}


function enlargeMemory() {
  abortOnCannotGrowMemory();
}


var TOTAL_STACK = Module['TOTAL_STACK'] || 5242880;
var TOTAL_MEMORY = Module['TOTAL_MEMORY'] || 16777216;
if (TOTAL_MEMORY < TOTAL_STACK) Module.printErr('TOTAL_MEMORY should be larger than TOTAL_STACK, was ' + TOTAL_MEMORY + '! (TOTAL_STACK=' + TOTAL_STACK + ')');

// Initialize the runtime's memory
// check for full engine support (use string 'subarray' to avoid closure compiler confusion)
assert(typeof Int32Array !== 'undefined' && typeof Float64Array !== 'undefined' && Int32Array.prototype.subarray !== undefined && Int32Array.prototype.set !== undefined,
       'JS engine does not provide full typed array support');



// Use a provided buffer, if there is one, or else allocate a new one
if (Module['buffer']) {
  buffer = Module['buffer'];
  assert(buffer.byteLength === TOTAL_MEMORY, 'provided buffer should be ' + TOTAL_MEMORY + ' bytes, but it is ' + buffer.byteLength);
} else {
  // Use a WebAssembly memory where available
  {
    buffer = new ArrayBuffer(TOTAL_MEMORY);
  }
  assert(buffer.byteLength === TOTAL_MEMORY);
  Module['buffer'] = buffer;
}
updateGlobalBufferViews();


function getTotalMemory() {
  return TOTAL_MEMORY;
}

// Endianness check (note: assumes compiler arch was little-endian)
  HEAP32[0] = 0x63736d65; /* 'emsc' */
HEAP16[1] = 0x6373;
if (HEAPU8[2] !== 0x73 || HEAPU8[3] !== 0x63) throw 'Runtime error: expected the system to be little-endian!';

function callRuntimeCallbacks(callbacks) {
  while(callbacks.length > 0) {
    var callback = callbacks.shift();
    if (typeof callback == 'function') {
      callback();
      continue;
    }
    var func = callback.func;
    if (typeof func === 'number') {
      if (callback.arg === undefined) {
        Module['dynCall_v'](func);
      } else {
        Module['dynCall_vi'](func, callback.arg);
      }
    } else {
      func(callback.arg === undefined ? null : callback.arg);
    }
  }
}

var __ATPRERUN__  = []; // functions called before the runtime is initialized
var __ATINIT__    = []; // functions called during startup
var __ATMAIN__    = []; // functions called when main() is to be run
var __ATEXIT__    = []; // functions called during shutdown
var __ATPOSTRUN__ = []; // functions called after the runtime has exited

var runtimeInitialized = false;
var runtimeExited = false;


function preRun() {
  // compatibility - merge in anything from Module['preRun'] at this time
  if (Module['preRun']) {
    if (typeof Module['preRun'] == 'function') Module['preRun'] = [Module['preRun']];
    while (Module['preRun'].length) {
      addOnPreRun(Module['preRun'].shift());
    }
  }
  callRuntimeCallbacks(__ATPRERUN__);
}

function ensureInitRuntime() {
  checkStackCookie();
  if (runtimeInitialized) return;
  runtimeInitialized = true;
  callRuntimeCallbacks(__ATINIT__);
}

function preMain() {
  checkStackCookie();
  callRuntimeCallbacks(__ATMAIN__);
}

function exitRuntime() {
  checkStackCookie();
  callRuntimeCallbacks(__ATEXIT__);
  runtimeExited = true;
}

function postRun() {
  checkStackCookie();
  // compatibility - merge in anything from Module['postRun'] at this time
  if (Module['postRun']) {
    if (typeof Module['postRun'] == 'function') Module['postRun'] = [Module['postRun']];
    while (Module['postRun'].length) {
      addOnPostRun(Module['postRun'].shift());
    }
  }
  callRuntimeCallbacks(__ATPOSTRUN__);
}

function addOnPreRun(cb) {
  __ATPRERUN__.unshift(cb);
}

function addOnInit(cb) {
  __ATINIT__.unshift(cb);
}

function addOnPreMain(cb) {
  __ATMAIN__.unshift(cb);
}

function addOnExit(cb) {
  __ATEXIT__.unshift(cb);
}

function addOnPostRun(cb) {
  __ATPOSTRUN__.unshift(cb);
}

// Deprecated: This function should not be called because it is unsafe and does not provide
// a maximum length limit of how many bytes it is allowed to write. Prefer calling the
// function stringToUTF8Array() instead, which takes in a maximum length that can be used
// to be secure from out of bounds writes.
/** @deprecated */
function writeStringToMemory(string, buffer, dontAddNull) {
  warnOnce('writeStringToMemory is deprecated and should not be called! Use stringToUTF8() instead!');

  var /** @type {number} */ lastChar, /** @type {number} */ end;
  if (dontAddNull) {
    // stringToUTF8Array always appends null. If we don't want to do that, remember the
    // character that existed at the location where the null will be placed, and restore
    // that after the write (below).
    end = buffer + lengthBytesUTF8(string);
    lastChar = HEAP8[end];
  }
  stringToUTF8(string, buffer, Infinity);
  if (dontAddNull) HEAP8[end] = lastChar; // Restore the value under the null character.
}

function writeArrayToMemory(array, buffer) {
  assert(array.length >= 0, 'writeArrayToMemory array must have a length (should be an array or typed array)')
  HEAP8.set(array, buffer);
}

function writeAsciiToMemory(str, buffer, dontAddNull) {
  for (var i = 0; i < str.length; ++i) {
    assert(str.charCodeAt(i) === str.charCodeAt(i)&0xff);
    HEAP8[((buffer++)>>0)]=str.charCodeAt(i);
  }
  // Null-terminate the pointer to the HEAP.
  if (!dontAddNull) HEAP8[((buffer)>>0)]=0;
}

function unSign(value, bits, ignore) {
  if (value >= 0) {
    return value;
  }
  return bits <= 32 ? 2*Math.abs(1 << (bits-1)) + value // Need some trickery, since if bits == 32, we are right at the limit of the bits JS uses in bitshifts
                    : Math.pow(2, bits)         + value;
}
function reSign(value, bits, ignore) {
  if (value <= 0) {
    return value;
  }
  var half = bits <= 32 ? Math.abs(1 << (bits-1)) // abs is needed if bits == 32
                        : Math.pow(2, bits-1);
  if (value >= half && (bits <= 32 || value > half)) { // for huge values, we can hit the precision limit and always get true here. so don't do that
                                                       // but, in general there is no perfect solution here. With 64-bit ints, we get rounding and errors
                                                       // TODO: In i64 mode 1, resign the two parts separately and safely
    value = -2*half + value; // Cannot bitshift half, as it may be at the limit of the bits JS uses in bitshifts
  }
  return value;
}

assert(Math['imul'] && Math['fround'] && Math['clz32'] && Math['trunc'], 'this is a legacy browser, build with LEGACY_VM_SUPPORT');

var Math_abs = Math.abs;
var Math_cos = Math.cos;
var Math_sin = Math.sin;
var Math_tan = Math.tan;
var Math_acos = Math.acos;
var Math_asin = Math.asin;
var Math_atan = Math.atan;
var Math_atan2 = Math.atan2;
var Math_exp = Math.exp;
var Math_log = Math.log;
var Math_sqrt = Math.sqrt;
var Math_ceil = Math.ceil;
var Math_floor = Math.floor;
var Math_pow = Math.pow;
var Math_imul = Math.imul;
var Math_fround = Math.fround;
var Math_round = Math.round;
var Math_min = Math.min;
var Math_max = Math.max;
var Math_clz32 = Math.clz32;
var Math_trunc = Math.trunc;

// A counter of dependencies for calling run(). If we need to
// do asynchronous work before running, increment this and
// decrement it. Incrementing must happen in a place like
// PRE_RUN_ADDITIONS (used by emcc to add file preloading).
// Note that you can add dependencies in preRun, even though
// it happens right before run - run will be postponed until
// the dependencies are met.
var runDependencies = 0;
var runDependencyWatcher = null;
var dependenciesFulfilled = null; // overridden to take different actions when all run dependencies are fulfilled
var runDependencyTracking = {};

function getUniqueRunDependency(id) {
  var orig = id;
  while (1) {
    if (!runDependencyTracking[id]) return id;
    id = orig + Math.random();
  }
  return id;
}

function addRunDependency(id) {
  runDependencies++;
  if (Module['monitorRunDependencies']) {
    Module['monitorRunDependencies'](runDependencies);
  }
  if (id) {
    assert(!runDependencyTracking[id]);
    runDependencyTracking[id] = 1;
    if (runDependencyWatcher === null && typeof setInterval !== 'undefined') {
      // Check for missing dependencies every few seconds
      runDependencyWatcher = setInterval(function() {
        if (ABORT) {
          clearInterval(runDependencyWatcher);
          runDependencyWatcher = null;
          return;
        }
        var shown = false;
        for (var dep in runDependencyTracking) {
          if (!shown) {
            shown = true;
            Module.printErr('still waiting on run dependencies:');
          }
          Module.printErr('dependency: ' + dep);
        }
        if (shown) {
          Module.printErr('(end of list)');
        }
      }, 10000);
    }
  } else {
    Module.printErr('warning: run dependency added without ID');
  }
}

function removeRunDependency(id) {
  runDependencies--;
  if (Module['monitorRunDependencies']) {
    Module['monitorRunDependencies'](runDependencies);
  }
  if (id) {
    assert(runDependencyTracking[id]);
    delete runDependencyTracking[id];
  } else {
    Module.printErr('warning: run dependency removed without ID');
  }
  if (runDependencies == 0) {
    if (runDependencyWatcher !== null) {
      clearInterval(runDependencyWatcher);
      runDependencyWatcher = null;
    }
    if (dependenciesFulfilled) {
      var callback = dependenciesFulfilled;
      dependenciesFulfilled = null;
      callback(); // can add another dependenciesFulfilled
    }
  }
}

Module["preloadedImages"] = {}; // maps url to image data
Module["preloadedAudios"] = {}; // maps url to audio data



var memoryInitializer = null;



var /* show errors on likely calls to FS when it was not included */ FS = {
  error: function() {
    abort('Filesystem support (FS) was not included. The problem is that you are using files from JS, but files were not used from C/C++, so filesystem support was not auto-included. You can force-include filesystem support with  -s FORCE_FILESYSTEM=1');
  },
  init: function() { FS.error() },
  createDataFile: function() { FS.error() },
  createPreloadedFile: function() { FS.error() },
  createLazyFile: function() { FS.error() },
  open: function() { FS.error() },
  mkdev: function() { FS.error() },
  registerDevice: function() { FS.error() },
  analyzePath: function() { FS.error() },
  loadFilesFromDB: function() { FS.error() },

  ErrnoError: function ErrnoError() { FS.error() },
};
Module['FS_createDataFile'] = FS.createDataFile;
Module['FS_createPreloadedFile'] = FS.createPreloadedFile;



// Prefix of data URIs emitted by SINGLE_FILE and related options.
var dataURIPrefix = 'data:application/octet-stream;base64,';

// Indicates whether filename is a base64 data URI.
function isDataURI(filename) {
  return String.prototype.startsWith ?
      filename.startsWith(dataURIPrefix) :
      filename.indexOf(dataURIPrefix) === 0;
}





// === Body ===

var ASM_CONSTS = [];





STATIC_BASE = GLOBAL_BASE;

STATICTOP = STATIC_BASE + 12208;
/* global initializers */  __ATINIT__.push();


memoryInitializer = "data:application/octet-stream;base64,txMAAL0UAAAlCAAAKQgAANEDAADWAwAAEwgAABcIAAAlCAAA3AMAAOUDAADvAwAAPQgAAEgIAABRCAAAWwgAAGkIAAB1CAAAgQgAAFgAAAAFAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACAAAAAwAAAKUrAAAABAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAAAK/////wAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWAAAANwAAAAFAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAEAAAAAwAAAK0vAAAAAAAAAAAAAAAAAAACAAAAAAAAAAAAAAAAAAD//////wAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABkKwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACVzOiBCb3VuZHMgY2hlY2sgZmFpbGVkOiAwIDw9ICVpIDwgJWkKAGZ1c192YWx1ZV9hcnJfZ2V0X2kAZnVzX3ZhbHVlX2Fycl9zZXRfaQBhZGRyZXNzPSVwLCB0eXBlPSVzLCByZWZjb3VudD0laQoAJXM6IFdBUk5JTkc6IENsZWFudXAgb2YgdmFsdWUgd2l0aCBub256ZXJvIHJlZmNvdW50OiAAZnVzX2JveGVkX2NsZWFudXAAJXM6IEdvdCB3ZWlyZCBib3hlZCB0eXBlOiAlaQoAJXM6IFdBUk5JTkc6IEJveGVkIHZhbHVlJ3MgcmVmY291bnQgaGFzIGdvbmUgbmVnYXRpdmU6IABmdXNfYm94ZWRfZGV0YWNoAGZ1c19wZXJyb3I6IABmdXNfZXhpdDogc3RhdHVzPSVpCgBmdXNfbWFsbG9jAGZ1c19yZWFsbG9jAGZ1c19tZW1zZXQAZnVzX21lbWNweQBmdXNfbWVtbW92ZQA8bm8gZmlsZT4AZG9uZQBlcnJvcgBhcnJfb3BlbgBhcnJfY2xvc2UAc3BsaXQAJXM6IFRPRE86IEhhbmRsZSAic3BsaXQiIHRva2VucwoAZnVzX2xleGVyX2xvYWRfY2h1bmsALi4uACVzOiByb3cgJWk6IGNvbCAlaTogJXMgdG9rZW4gIiUuKnMiJXMAJXM6IE1pc3Npbmcga2V5OiAlcyAoc3ltICMlaSkKAGZ1c19vYmpfZ2V0AFBBUlNFUjoKACAgYXJyX3N0YWNrIGxlbmd0aDogJWkKACAgdmFsdWVzOgoAICAgIAAlczogAGZ1c19wYXJzZXJfcGFyc2VfbGV4ZXIAVG9vIG1hbnkgY2xvc2UgcGFyZW5zAENhbid0IHBhcnNlIHRva2VuACVzOiBUcmllZCB0byBwb3AgZnJvbSBlbXB0eSBhcnJheQoAZnVzX3BhcnNlcl9wb3BfYXJyACVzOiBFUlJPUjogVG9rZW4gdG9vIHNob3J0IChtdXN0IGJlIGF0IGxlYXN0IDIgY2hhcnMpCgBmdXNfdmFsdWVfdG9rZW5wYXJzZV9zdHIALi4udG9rZW4gd2FzOiAlLipzCgAlczogRVJST1I6IFRva2VuIG11c3Qgc3RhcnQgJiBlbmQgd2l0aCAnIicKACVzOiBFUlJPUjogV2UgY2FuJ3QgaGFuZGxlIHRva2VucyB3aXRoIE5VTCBieXRlcyBhdCB0aGUgbW9tZW50LCB0cnkgYWdhaW4gbmV4dCBUdWVzZGF5CgAlczogRVJST1I6IE1pc3NpbmcgZXNjYXBlIGNoYXJhY3RlcgoAJXM6IEVSUk9SOiBVbnJlY29nbml6ZWQgZXNjYXBlIGNoYXJhY3RlcgoAICAARkxVU0hJTkc6IFslLipzXQoAIABXUklUSU5HOiBbJS4qc10KACVzOiBUZXh0IGlzIHRvbyBsb25nLCB3aWxsIGJlIHRydW5jYXRlZCEgJWkgKyAlaSA+ICVpIAoAZnVzX3ByaW50ZXJfd3JpdGUAVGV4dCB3YXM6ICUuKnMKAEJVRkZFUjogWyUuKnNdCgBUAEYAKGAgAGVycgAlczogV0FSTklORzogdW5leHBlY3RlZCB2YWx1ZTogAGZ1c19wcmludGVyX3dyaXRlX3ZhbHVlACgiR290IGEgd2VpcmQgdmFsdWUiIGVycm9yKQAgLi4uACYAKCJHb3Qgd2VpcmQgYm94ZWQgdmFsdWUiIGVycm9yKQAgb2YoADoAKCkAPFVORVhQRUNURUQ+AGZ1c19wcmludGVyX3dyaXRlX2RhdGEAOiAAID0uACIAXG4AXCIAIlwAXAAgLAAAAAEBAXJ1bm5lcl9jYWxsZnJhbWUAe0Z1cyBlcnJvcjogJWxpIGlzIG5vdCBhIHN0cn0Ac3ltdGFibGVfZW50cnkAPFNZTSBOT1QgRk9VTkQ+AGludABzeW0AbnVsbABib29sAHN0cgBmdW4AdW5rbm93bgBVbmtub3duAFdyb25nIHR5cGUAT3ZlcmZsb3cAVW5kZXJmbG93AE91dCBvZiBCb3VuZHMAQ2FuJ3QgUGFyc2UATWlzc2luZyBrZXkATG9sIElkdW5ubwAlczogR290IG5lZ2F0aXZlIHN5bV9pOiAlaQoAZnVzX3ZhbHVlX3N5bQBjaGFyAHN5bV9pAHVuYm94ZWQAYXJyYXkAdmFsdWUAe0Z1cyBlcnIgIyVpOiAlc30AJXM6IFdBUk5JTkc6IENsZWFudXAgb2Ygdm0gd2l0aCBub256ZXJvIG5fYm94ZWQ6ICVpCgBmdXNfdm1fY2xlYW51cAAgICVzIGFkZHI9JXAgcmVmY291bnQ9JWkKAFVuYm94ZWQgaW50L251bGwvYm9vbCB0ZXN0cwAqICogKiAqICogKiAqICogKiAqICogKiAqICogKiAqICogKiAqICogKiAqICogKiAqICogKiAqICogKiAqICogKiAqICogKiAqICogKiAqIAoAQkVHSU46ICVzCgAgIGZ1c192YWx1ZV9pbnRfZGVjb2RlKHZtLCBmdXNfdmFsdWVfaW50KHZtLCAwKSkgPT0gMAoAICAgICVsaSA9PSAlbGkKACAgICBbRkFJTF0KACAgZnVzX3ZhbHVlX2ludF9kZWNvZGUodm0sIGZ1c192YWx1ZV9pbnQodm0sIC0xKSkgPT0gLTEKACAgZnVzX3ZhbHVlX2ludF9kZWNvZGUodm0sIGZ1c192YWx1ZV9pbnQodm0sIDEpKSA9PSAxCgAgIGZ1c192YWx1ZV9pbnRfZGVjb2RlKHZtLCBmdXNfdmFsdWVfaW50KHZtLCBGVVNfUEFZTE9BRF9NSU4pKSA9PSBGVVNfUEFZTE9BRF9NSU4KACAgZnVzX3ZhbHVlX2ludF9kZWNvZGUodm0sIGZ1c192YWx1ZV9pbnQodm0sIEZVU19QQVlMT0FEX01BWCkpID09IEZVU19QQVlMT0FEX01BWAoAICBmdXNfdmFsdWVfaW50X2RlY29kZSh2bSwgdngpID09IHgKACAgZnVzX3ZhbHVlX2ludF9kZWNvZGUodm0sIHZ5KSA9PSB5CgAgIGZ1c192YWx1ZV9pbnRfZGVjb2RlKHZtLCB2YWRkeHkpID09IHggKyB5CgAgIGZ1c192YWx1ZV9pbnRfZGVjb2RlKHZtLCB2c3VieHkpID09IHggLSB5CgAgIGZ1c192YWx1ZV9pbnRfZGVjb2RlKHZtLCB2bXVseHkpID09IHggKiB5CgAgIHZtLT5uX2JveGVkID09IDAKACAgICAlaSA9PSAlaQoARU5EOiAlcwoAT0sARkFJTABUZXN0cyBwYXNzZWQ6ICVpLyVpIFslc10KAAoAQXJyIHRlc3RzIChiYXNpYykAICBmdXNfdmFsdWVfaXNfYXJyKHZ4KQoAICBGVVNfUkVGQ09VTlQodngpID09IDEKACAgZnVzX3ZhbHVlX2ludF9kZWNvZGUodm0sIGZ1c192YWx1ZV9hcnJfbGVuKHZtLCB2eCkpID09IDAKACAgZnVzX3ZhbHVlX2lzX2Fycih2eDIpCgAgIHZ4Mi5wID09IHZ4LnAKACAgZnVzX3ZhbHVlX2ludF9kZWNvZGUodm0sIGZ1c192YWx1ZV9hcnJfbGVuKHZtLCB2eDIpKSA9PSAxCgAgIGZ1c192YWx1ZV9pbnRfZGVjb2RlKHZtLCBmdXNfdmFsdWVfYXJyX2dldF9pKHZtLCB2eDIsIDApKSA9PSAxMAoAICBGVVNfUkVGQ09VTlQodngyKSA9PSAxCgAgIEZVU19SRUZDT1VOVCh2eDIpID09IDMKACAgZnVzX3ZhbHVlX2lzX2Fycih2eDMpCgAgIHZ4My5wICE9IHZ4Mi5wCgAgIEZVU19SRUZDT1VOVCh2eDIpID09IDIKACAgRlVTX1JFRkNPVU5UKHZ4MykgPT0gMQoAICBmdXNfdmFsdWVfaXNfYXJyKHZ4NCkKACAgdng0LnAgIT0gdngzLnAKACAgZnVzX3ZhbHVlX2ludF9kZWNvZGUodm0sIHZwb3BwZWQpID09IDEwCgAgIEZVU19SRUZDT1VOVCh2eDQpID09IDEKACAgZnVzX3ZhbHVlX2ludF9kZWNvZGUodm0sIGZ1c192YWx1ZV9hcnJfbGVuKHZtLCB2eDMpKSA9PSAyCgAgIGZ1c192YWx1ZV9pbnRfZGVjb2RlKHZtLCBmdXNfdmFsdWVfYXJyX2dldF9pKHZtLCB2eDMsIDApKSA9PSAxMAoAICBmdXNfdmFsdWVfaW50X2RlY29kZSh2bSwgZnVzX3ZhbHVlX2Fycl9nZXRfaSh2bSwgdngzLCAxKSkgPT0gMjAKACAgZnVzX3ZhbHVlX2ludF9kZWNvZGUodm0sIGZ1c192YWx1ZV9hcnJfbGVuKHZtLCB2eDQpKSA9PSAwCgBQcmludGluZyB2eDM6CgAgIHZtLT5uX2JveGVkID09IDMKACAgdm0tPm5fYm94ZWQgPT0gMgoAICB2bS0+bl9ib3hlZCA9PSAxCgBBcnIgdGVzdHMgKGludGVybWVkaWF0ZSkAQXJyIHRlc3RzICguLi5hbHNvIGludGVybWVkaWF0ZT8pACAgRlVTX1JFRkNPVU5UKHZwdXNoZWQpID09IDMKACAgRlVTX1JFRkNPVU5UKHZwdXQpID09IDEKACAgRlVTX1JFRkNPVU5UKHZwdXNoZWQpID09IDIKACAgdnB1dC5wID09IHZnb3QucAoAICAgICVwID09ICVwCgBTdHIgdGVzdHMAQVNEACAgZnVzX3ZhbHVlX2ludF9kZWNvZGUodm0sIHZ4X2xlbikgPT0gMwoATGV4ZXIgdGVzdHMAICAvKiBGdWxsIGxleCwgTlVMLXRlcm1pbmF0ZWQgKi8KAGRlZiB0ZXN0OgogICAgYXJyICJUaGluZyAiLCAyLCAiOiAiLCAob2JqIDEgPS54IDIgPS55KSwgIiEiLAogICAgQGZvcm1hdCAiVGhpbmcgMjoge3g6IDEsIHk6IDJ9ISIgc3RyX2VxIGFzc2VydAAgIGZ1c19sZXhlcl9pc19kb25lKCZsZXhlcikKACAgZnVzX2xleGVyX2dvdCgmbGV4ZXIsICIiKQoAICAvKiBGdWxsIGxleCwgbm8gTlVMLCBtYXJrZWQgZmluYWwgKi8KACAgLyogRnVsbCBsZXgsIHNwbGl0IHRva2VuLCB3aGl0ZXNwYWNlICovCgBkZWYgdGVzdDoKICAgIGFyciAiVGhpbmcgIiwgMiwgIjogIiwgKG9iaiAxID0ueCAyID0ueSksICIhIiwKICAgIEBmb3JtYXQgIlRoaW5nIDI6IHt4OiAxLCB5OiAyfSEiIHN0cl9lcSBhc3NlcnQgACAgZnVzX2xleGVyX2lzX3NwbGl0KCZsZXhlcikKACAgLyogRnVsbCBsZXgsIHNwbGl0IHRva2VuLCBub24td2hpdGVzcGFjZSAqLwoAICBmdXNfbGV4ZXJfZ290KCZsZXhlciwgImFzc2VydCIpCgBhc3NlcnQAICAvKiBGdWxsIGxleCwgdG9rZW4tYnktdG9rZW4gKi8KACAgZnVzX2xleGVyX2dvdCgmbGV4ZXIsICJkZWYiKQoAZGVmACAgbGV4ZXIudG9rZW5fdHlwZSA9PSBGVVNfVE9LRU5fU1lNCgAgIGZ1c19sZXhlcl9nb3QoJmxleGVyLCAidGVzdCIpCgB0ZXN0ACAgZnVzX2xleGVyX2dvdCgmbGV4ZXIsICIoIikKACgAICBsZXhlci50b2tlbl90eXBlID09IEZVU19UT0tFTl9BUlJfT1BFTgoAICBmdXNfbGV4ZXJfZ290KCZsZXhlciwgImFyciIpCgBhcnIAICBmdXNfbGV4ZXJfZ290KCZsZXhlciwgIlwiVGhpbmcgXCIiKQoAIlRoaW5nICIAICBsZXhlci50b2tlbl90eXBlID09IEZVU19UT0tFTl9TVFIKACAgZnVzX2xleGVyX2dvdCgmbGV4ZXIsICIsIikKACwAICBmdXNfbGV4ZXJfZ290KCZsZXhlciwgIjIiKQoAMgAgIGxleGVyLnRva2VuX3R5cGUgPT0gRlVTX1RPS0VOX0lOVAoAICBmdXNfbGV4ZXJfZ290KCZsZXhlciwgIlwiOiBcIiIpCgAiOiAiACAgZnVzX2xleGVyX2dvdCgmbGV4ZXIsICJvYmoiKQoAb2JqACAgZnVzX2xleGVyX2dvdCgmbGV4ZXIsICIxIikKADEAICBmdXNfbGV4ZXJfZ290KCZsZXhlciwgIj0uIikKAD0uACAgZnVzX2xleGVyX2dvdCgmbGV4ZXIsICJ4IikKAHgAICBmdXNfbGV4ZXJfZ290KCZsZXhlciwgInkiKQoAeQAgIGZ1c19sZXhlcl9nb3QoJmxleGVyLCAiKSIpCgApACAgbGV4ZXIudG9rZW5fdHlwZSA9PSBGVVNfVE9LRU5fQVJSX0NMT1NFCgAgIGZ1c19sZXhlcl9nb3QoJmxleGVyLCAiXCIhXCIiKQoAIiEiACAgZnVzX2xleGVyX2dvdCgmbGV4ZXIsICJAIikKAEAAICBmdXNfbGV4ZXJfZ290KCZsZXhlciwgImZvcm1hdCIpCgBmb3JtYXQAICBmdXNfbGV4ZXJfZ290KCZsZXhlciwgIlwiVGhpbmcgMjoge3g6IDEsIHk6IDJ9IVwiIikKACJUaGluZyAyOiB7eDogMSwgeTogMn0hIgAgIGZ1c19sZXhlcl9nb3QoJmxleGVyLCAic3RyX2VxIikKAHN0cl9lcQBTeW10YWJsZSB0ZXN0cyAobm8gdm0pACAgZnVzX3N5bXRhYmxlX2xlbigmdGFibGUpID09IDAKACAgZnVzX3N5bXRhYmxlX2xlbigmdGFibGUpID09IDEKACAgZnVzX3N5bXRhYmxlX2dldF9mcm9tX3N0cmluZygmdGFibGUsICJ4IikgPT0gc3ltX2lfeAoAICBmdXNfc3ltdGFibGVfZ2V0X29yX2FkZF9mcm9tX3N0cmluZygmdGFibGUsICJ4IikgPT0gc3ltX2lfeAoAICBmdXNfc3ltdGFibGVfbGVuKCZ0YWJsZSkgPT0gMgoAICBzeW1faV94ICE9IHN5bV9pX3kKACAgICAlaSAhPSAlaQoATEEgTEEgJCNAJAAgIGZ1c19zeW10YWJsZV9sZW4oJnRhYmxlKSA9PSAzCgAgIGZ1c19zeW10YWJsZV9nZXRfZnJvbV9zdHJpbmcoJnRhYmxlLCAiTEEgTEEiKSA9PSAtMQoATEEgTEEAICBmdXNfc3ltdGFibGVfZ2V0X2Zyb21fc3RyaW5nKCZ0YWJsZSwgIkxBIExBICQjQCQgMiIpID09IC0xCgBMQSBMQSAkI0AkIDIAICBmdXNfc3ltdGFibGVfZ2V0X2Zyb21fc3RyaW5nKCZ0YWJsZSwgIkxBIExBICQjQCQiKSA9PSBzeW1faV9sYWxhCgBTeW10YWJsZSB0ZXN0cyAoZnVsbCkAICBmdXNfdmFsdWVfc3ltX2RlY29kZSh2bSwgZnVzX3ZhbHVlX3N5bSh2bSwgc3ltX2lfeCkpID09IHN5bV9pX3gKACAgZnVzX3ZhbHVlX3N5bV9kZWNvZGUodm0sIGZ1c192YWx1ZV9zeW0odm0sIHN5bV9pX3kpKSA9PSBzeW1faV95CgAgIGZ1c192YWx1ZV9zeW1fZGVjb2RlKHZtLCBmdXNfdmFsdWVfc3ltKHZtLCBzeW1faV94KSkgIT0gZnVzX3ZhbHVlX3N5bV9kZWNvZGUodm0sIGZ1c192YWx1ZV9zeW0odm0sIHN5bV9pX3kpKQoAICAgICVsaSAhPSAlbGkKAE9iaiB0ZXN0cyAoYmFzaWMpAFByaW50aW5nIHZvOgoAICBmdXNfdmFsdWVfaW50X2RlY29kZSh2bSwgZnVzX3ZhbHVlX29ial9nZXQodm0sIHZvLCBzeCkpID09IDEwCgAgIGZ1c192YWx1ZV9pbnRfZGVjb2RlKHZtLCBmdXNfdmFsdWVfb2JqX2dldCh2bSwgdm8sIHN5KSkgPT0gMjAKACAgZnVzX3ZhbHVlX2ludF9kZWNvZGUodm0sIGZ1c192YWx1ZV9vYmpfZ2V0KHZtLCB2bywgc3gpKSA9PSAzMAoAUGFyc2VyIHRlc3RzICh2YWx1ZXMpACAgZnVzX3ZhbHVlX2ludF9kZWNvZGUodm0sIGZ1c192YWx1ZV9zdHJpbmdwYXJzZV9pbnQodm0sICIwIikpID09IDAKADAAICBmdXNfdmFsdWVfaW50X2RlY29kZSh2bSwgZnVzX3ZhbHVlX3N0cmluZ3BhcnNlX2ludCh2bSwgIjEiKSkgPT0gMQoAICBmdXNfdmFsdWVfaW50X2RlY29kZSh2bSwgZnVzX3ZhbHVlX3N0cmluZ3BhcnNlX2ludCh2bSwgIjEwIikpID09IDEwCgAxMAAgIGZ1c192YWx1ZV9pbnRfZGVjb2RlKHZtLCBmdXNfdmFsdWVfc3RyaW5ncGFyc2VfaW50KHZtLCAiMjYiKSkgPT0gMjYKADI2ACAgZnVzX3ZhbHVlX2ludF9kZWNvZGUodm0sIGZ1c192YWx1ZV9zdHJpbmdwYXJzZV9pbnQodm0sICI5OTkiKSkgPT0gOTk5CgA5OTkAICBmdXNfdmFsdWVfaW50X2RlY29kZSh2bSwgZnVzX3ZhbHVlX3N0cmluZ3BhcnNlX2ludCh2bSwgIi05OTkiKSkgPT0gLTk5OQoALTk5OQAgIGZ1c192YWx1ZV9pbnRfZGVjb2RlKHZtLCBmdXNfdmFsdWVfc3RyaW5ncGFyc2VfaW50KHZtLCAiLTAiKSkgPT0gMAoALTAAICBmdXNfdmFsdWVfc3ltX2RlY29kZSh2bSwgZnVzX3ZhbHVlX3N0cmluZ3BhcnNlX3N5bSh2bSwgIngiKSkgPT0gZnVzX3N5bXRhYmxlX2dldF9mcm9tX3N0cmluZyh2bS0+c3ltdGFibGUsICJ4IikKACAgZnVzX3ZhbHVlX3N5bV9kZWNvZGUodm0sIGZ1c192YWx1ZV9zdHJpbmdwYXJzZV9zeW0odm0sICJBQkMxMjMhQCMiKSkgPT0gZnVzX3N5bXRhYmxlX2dldF9mcm9tX3N0cmluZyh2bS0+c3ltdGFibGUsICJBQkMxMjMhQCMiKQoAQUJDMTIzIUAjACJBQkMiAEFCQwAgICFzdHJjbXAoZnVzX3ZhbHVlX3N0cl9kZWNvZGUodm0sIHZzMSksICJBQkMiKQoAICAgIE5PVEU6IGxocyBpcyBOVUxMCgAgICAgTk9URTogcmhzIGlzIE5VTEwKACJUV09cbkxJTkVTIgBUV08KTElORVMAICAhc3RyY21wKGZ1c192YWx1ZV9zdHJfZGVjb2RlKHZtLCB2czIpLCAiVFdPXG5MSU5FUyIpCgAiXCJRVU9URURcIiIAIlFVT1RFRCIAICAhc3RyY21wKGZ1c192YWx1ZV9zdHJfZGVjb2RlKHZtLCB2czMpLCAiXCJRVU9URURcIiIpCgBQYXJzZXIgdGVzdHMgKGZ1bGwpACAgcGFyc2VyLmFycl9zdGFjay5sZW4gPT0gMAoAICBwYXJzZXIuYXJyLnZhbHVlcy5sZW4gPT0gMAoAICBwYXJzZXIuYXJyLnZhbHVlcy5sZW4gPT0gMgoAICBwYXJzZXIuYXJyX3N0YWNrLmxlbiA9PSAxCgAgIHBhcnNlci5hcnJfc3RhY2subGVuID09IDIKACAgcGFyc2VyLmFyci52YWx1ZXMubGVuID09IDcKACAgcGFyc2VyLmFyci52YWx1ZXMubGVuID09IDE2CgAgIHBhcnNlci5hcnIudmFsdWVzLmxlbiA9PSAzCgBQYXJzZXIgdGVzdHMgKHdpdGggbGV4ZXIpAFRPVEFMUzoKABEACgAREREAAAAABQAAAAAAAAkAAAAACwAAAAAAAAAAEQAPChEREQMKBwABEwkLCwAACQYLAAALAAYRAAAAERERAAAAAAAAAAAAAAAAAAAAAAsAAAAAAAAAABEACgoREREACgAAAgAJCwAAAAkACwAACwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAMAAAAAAAAAAAAAAAMAAAAAAwAAAAACQwAAAAAAAwAAAwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAADgAAAAAAAAAAAAAADQAAAAQNAAAAAAkOAAAAAAAOAAAOAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAA8AAAAADwAAAAAJEAAAAAAAEAAAEAAAEgAAABISEgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAASAAAAEhISAAAAAAAACQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACwAAAAAAAAAAAAAACgAAAAAKAAAAAAkLAAAAAAALAAALAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAwAAAAAAAAAAAAAAAwAAAAADAAAAAAJDAAAAAAADAAADAAALSsgICAwWDB4AChudWxsKQAtMFgrMFggMFgtMHgrMHggMHgAaW5mAElORgBuYW4ATkFOADAxMjM0NTY3ODlBQkNERUYuAFQhIhkNAQIDEUscDBAECx0SHidobm9wcWIgBQYPExQVGggWBygkFxgJCg4bHyUjg4J9JiorPD0+P0NHSk1YWVpbXF1eX2BhY2RlZmdpamtscnN0eXp7fABJbGxlZ2FsIGJ5dGUgc2VxdWVuY2UARG9tYWluIGVycm9yAFJlc3VsdCBub3QgcmVwcmVzZW50YWJsZQBOb3QgYSB0dHkAUGVybWlzc2lvbiBkZW5pZWQAT3BlcmF0aW9uIG5vdCBwZXJtaXR0ZWQATm8gc3VjaCBmaWxlIG9yIGRpcmVjdG9yeQBObyBzdWNoIHByb2Nlc3MARmlsZSBleGlzdHMAVmFsdWUgdG9vIGxhcmdlIGZvciBkYXRhIHR5cGUATm8gc3BhY2UgbGVmdCBvbiBkZXZpY2UAT3V0IG9mIG1lbW9yeQBSZXNvdXJjZSBidXN5AEludGVycnVwdGVkIHN5c3RlbSBjYWxsAFJlc291cmNlIHRlbXBvcmFyaWx5IHVuYXZhaWxhYmxlAEludmFsaWQgc2VlawBDcm9zcy1kZXZpY2UgbGluawBSZWFkLW9ubHkgZmlsZSBzeXN0ZW0ARGlyZWN0b3J5IG5vdCBlbXB0eQBDb25uZWN0aW9uIHJlc2V0IGJ5IHBlZXIAT3BlcmF0aW9uIHRpbWVkIG91dABDb25uZWN0aW9uIHJlZnVzZWQASG9zdCBpcyBkb3duAEhvc3QgaXMgdW5yZWFjaGFibGUAQWRkcmVzcyBpbiB1c2UAQnJva2VuIHBpcGUASS9PIGVycm9yAE5vIHN1Y2ggZGV2aWNlIG9yIGFkZHJlc3MAQmxvY2sgZGV2aWNlIHJlcXVpcmVkAE5vIHN1Y2ggZGV2aWNlAE5vdCBhIGRpcmVjdG9yeQBJcyBhIGRpcmVjdG9yeQBUZXh0IGZpbGUgYnVzeQBFeGVjIGZvcm1hdCBlcnJvcgBJbnZhbGlkIGFyZ3VtZW50AEFyZ3VtZW50IGxpc3QgdG9vIGxvbmcAU3ltYm9saWMgbGluayBsb29wAEZpbGVuYW1lIHRvbyBsb25nAFRvbyBtYW55IG9wZW4gZmlsZXMgaW4gc3lzdGVtAE5vIGZpbGUgZGVzY3JpcHRvcnMgYXZhaWxhYmxlAEJhZCBmaWxlIGRlc2NyaXB0b3IATm8gY2hpbGQgcHJvY2VzcwBCYWQgYWRkcmVzcwBGaWxlIHRvbyBsYXJnZQBUb28gbWFueSBsaW5rcwBObyBsb2NrcyBhdmFpbGFibGUAUmVzb3VyY2UgZGVhZGxvY2sgd291bGQgb2NjdXIAU3RhdGUgbm90IHJlY292ZXJhYmxlAFByZXZpb3VzIG93bmVyIGRpZWQAT3BlcmF0aW9uIGNhbmNlbGVkAEZ1bmN0aW9uIG5vdCBpbXBsZW1lbnRlZABObyBtZXNzYWdlIG9mIGRlc2lyZWQgdHlwZQBJZGVudGlmaWVyIHJlbW92ZWQARGV2aWNlIG5vdCBhIHN0cmVhbQBObyBkYXRhIGF2YWlsYWJsZQBEZXZpY2UgdGltZW91dABPdXQgb2Ygc3RyZWFtcyByZXNvdXJjZXMATGluayBoYXMgYmVlbiBzZXZlcmVkAFByb3RvY29sIGVycm9yAEJhZCBtZXNzYWdlAEZpbGUgZGVzY3JpcHRvciBpbiBiYWQgc3RhdGUATm90IGEgc29ja2V0AERlc3RpbmF0aW9uIGFkZHJlc3MgcmVxdWlyZWQATWVzc2FnZSB0b28gbGFyZ2UAUHJvdG9jb2wgd3JvbmcgdHlwZSBmb3Igc29ja2V0AFByb3RvY29sIG5vdCBhdmFpbGFibGUAUHJvdG9jb2wgbm90IHN1cHBvcnRlZABTb2NrZXQgdHlwZSBub3Qgc3VwcG9ydGVkAE5vdCBzdXBwb3J0ZWQAUHJvdG9jb2wgZmFtaWx5IG5vdCBzdXBwb3J0ZWQAQWRkcmVzcyBmYW1pbHkgbm90IHN1cHBvcnRlZCBieSBwcm90b2NvbABBZGRyZXNzIG5vdCBhdmFpbGFibGUATmV0d29yayBpcyBkb3duAE5ldHdvcmsgdW5yZWFjaGFibGUAQ29ubmVjdGlvbiByZXNldCBieSBuZXR3b3JrAENvbm5lY3Rpb24gYWJvcnRlZABObyBidWZmZXIgc3BhY2UgYXZhaWxhYmxlAFNvY2tldCBpcyBjb25uZWN0ZWQAU29ja2V0IG5vdCBjb25uZWN0ZWQAQ2Fubm90IHNlbmQgYWZ0ZXIgc29ja2V0IHNodXRkb3duAE9wZXJhdGlvbiBhbHJlYWR5IGluIHByb2dyZXNzAE9wZXJhdGlvbiBpbiBwcm9ncmVzcwBTdGFsZSBmaWxlIGhhbmRsZQBSZW1vdGUgSS9PIGVycm9yAFF1b3RhIGV4Y2VlZGVkAE5vIG1lZGl1bSBmb3VuZABXcm9uZyBtZWRpdW0gdHlwZQBObyBlcnJvciBpbmZvcm1hdGlvbg==";





/* no memory initializer */
var tempDoublePtr = STATICTOP; STATICTOP += 16;

assert(tempDoublePtr % 8 == 0);

function copyTempFloat(ptr) { // functions, because inlining this code increases code size too much

  HEAP8[tempDoublePtr] = HEAP8[ptr];

  HEAP8[tempDoublePtr+1] = HEAP8[ptr+1];

  HEAP8[tempDoublePtr+2] = HEAP8[ptr+2];

  HEAP8[tempDoublePtr+3] = HEAP8[ptr+3];

}

function copyTempDouble(ptr) {

  HEAP8[tempDoublePtr] = HEAP8[ptr];

  HEAP8[tempDoublePtr+1] = HEAP8[ptr+1];

  HEAP8[tempDoublePtr+2] = HEAP8[ptr+2];

  HEAP8[tempDoublePtr+3] = HEAP8[ptr+3];

  HEAP8[tempDoublePtr+4] = HEAP8[ptr+4];

  HEAP8[tempDoublePtr+5] = HEAP8[ptr+5];

  HEAP8[tempDoublePtr+6] = HEAP8[ptr+6];

  HEAP8[tempDoublePtr+7] = HEAP8[ptr+7];

}

// {{PRE_LIBRARY}}


  function ___lock() {}

  
  var SYSCALLS={varargs:0,get:function (varargs) {
        SYSCALLS.varargs += 4;
        var ret = HEAP32[(((SYSCALLS.varargs)-(4))>>2)];
        return ret;
      },getStr:function () {
        var ret = Pointer_stringify(SYSCALLS.get());
        return ret;
      },get64:function () {
        var low = SYSCALLS.get(), high = SYSCALLS.get();
        if (low >= 0) assert(high === 0);
        else assert(high === -1);
        return low;
      },getZero:function () {
        assert(SYSCALLS.get() === 0);
      }};function ___syscall140(which, varargs) {SYSCALLS.varargs = varargs;
  try {
   // llseek
      var stream = SYSCALLS.getStreamFromFD(), offset_high = SYSCALLS.get(), offset_low = SYSCALLS.get(), result = SYSCALLS.get(), whence = SYSCALLS.get();
      // NOTE: offset_high is unused - Emscripten's off_t is 32-bit
      var offset = offset_low;
      FS.llseek(stream, offset, whence);
      HEAP32[((result)>>2)]=stream.position;
      if (stream.getdents && offset === 0 && whence === 0) stream.getdents = null; // reset readdir state
      return 0;
    } catch (e) {
    if (typeof FS === 'undefined' || !(e instanceof FS.ErrnoError)) abort(e);
    return -e.errno;
  }
  }

  
  function flush_NO_FILESYSTEM() {
      // flush anything remaining in the buffers during shutdown
      var fflush = Module["_fflush"];
      if (fflush) fflush(0);
      var printChar = ___syscall146.printChar;
      if (!printChar) return;
      var buffers = ___syscall146.buffers;
      if (buffers[1].length) printChar(1, 10);
      if (buffers[2].length) printChar(2, 10);
    }function ___syscall146(which, varargs) {SYSCALLS.varargs = varargs;
  try {
   // writev
      // hack to support printf in NO_FILESYSTEM
      var stream = SYSCALLS.get(), iov = SYSCALLS.get(), iovcnt = SYSCALLS.get();
      var ret = 0;
      if (!___syscall146.buffers) {
        ___syscall146.buffers = [null, [], []]; // 1 => stdout, 2 => stderr
        ___syscall146.printChar = function(stream, curr) {
          var buffer = ___syscall146.buffers[stream];
          assert(buffer);
          if (curr === 0 || curr === 10) {
            (stream === 1 ? Module['print'] : Module['printErr'])(UTF8ArrayToString(buffer, 0));
            buffer.length = 0;
          } else {
            buffer.push(curr);
          }
        };
      }
      for (var i = 0; i < iovcnt; i++) {
        var ptr = HEAP32[(((iov)+(i*8))>>2)];
        var len = HEAP32[(((iov)+(i*8 + 4))>>2)];
        for (var j = 0; j < len; j++) {
          ___syscall146.printChar(stream, HEAPU8[ptr+j]);
        }
        ret += len;
      }
      return ret;
    } catch (e) {
    if (typeof FS === 'undefined' || !(e instanceof FS.ErrnoError)) abort(e);
    return -e.errno;
  }
  }

  function ___syscall54(which, varargs) {SYSCALLS.varargs = varargs;
  try {
   // ioctl
      return 0;
    } catch (e) {
    if (typeof FS === 'undefined' || !(e instanceof FS.ErrnoError)) abort(e);
    return -e.errno;
  }
  }

  function ___syscall6(which, varargs) {SYSCALLS.varargs = varargs;
  try {
   // close
      var stream = SYSCALLS.getStreamFromFD();
      FS.close(stream);
      return 0;
    } catch (e) {
    if (typeof FS === 'undefined' || !(e instanceof FS.ErrnoError)) abort(e);
    return -e.errno;
  }
  }

  
  
   
  
   
  
  var cttz_i8 = allocate([8,0,1,0,2,0,1,0,3,0,1,0,2,0,1,0,4,0,1,0,2,0,1,0,3,0,1,0,2,0,1,0,5,0,1,0,2,0,1,0,3,0,1,0,2,0,1,0,4,0,1,0,2,0,1,0,3,0,1,0,2,0,1,0,6,0,1,0,2,0,1,0,3,0,1,0,2,0,1,0,4,0,1,0,2,0,1,0,3,0,1,0,2,0,1,0,5,0,1,0,2,0,1,0,3,0,1,0,2,0,1,0,4,0,1,0,2,0,1,0,3,0,1,0,2,0,1,0,7,0,1,0,2,0,1,0,3,0,1,0,2,0,1,0,4,0,1,0,2,0,1,0,3,0,1,0,2,0,1,0,5,0,1,0,2,0,1,0,3,0,1,0,2,0,1,0,4,0,1,0,2,0,1,0,3,0,1,0,2,0,1,0,6,0,1,0,2,0,1,0,3,0,1,0,2,0,1,0,4,0,1,0,2,0,1,0,3,0,1,0,2,0,1,0,5,0,1,0,2,0,1,0,3,0,1,0,2,0,1,0,4,0,1,0,2,0,1,0,3,0,1,0,2,0,1,0], "i8", ALLOC_STATIC);   

  function ___unlock() {}

   

   

   

  
  function __exit(status) {
      // void _exit(int status);
      // http://pubs.opengroup.org/onlinepubs/000095399/functions/exit.html
      Module['exit'](status);
    }function _exit(status) {
      __exit(status);
    }



   

  
  function _emscripten_memcpy_big(dest, src, num) {
      HEAPU8.set(HEAPU8.subarray(src, src+num), dest);
      return dest;
    } 

   

   

  
  function ___setErrNo(value) {
      if (Module['___errno_location']) HEAP32[((Module['___errno_location']())>>2)]=value;
      else Module.printErr('failed to set errno from JS');
      return value;
    } 
DYNAMICTOP_PTR = staticAlloc(4);

STACK_BASE = STACKTOP = alignMemory(STATICTOP);

STACK_MAX = STACK_BASE + TOTAL_STACK;

DYNAMIC_BASE = alignMemory(STACK_MAX);

HEAP32[DYNAMICTOP_PTR>>2] = DYNAMIC_BASE;

staticSealed = true; // seal the static portion of memory

assert(DYNAMIC_BASE < TOTAL_MEMORY, "TOTAL_MEMORY not big enough for stack");

var ASSERTIONS = true;

/** @type {function(string, boolean=, number=)} */
function intArrayFromString(stringy, dontAddNull, length) {
  var len = length > 0 ? length : lengthBytesUTF8(stringy)+1;
  var u8array = new Array(len);
  var numBytesWritten = stringToUTF8Array(stringy, u8array, 0, u8array.length);
  if (dontAddNull) u8array.length = numBytesWritten;
  return u8array;
}

function intArrayToString(array) {
  var ret = [];
  for (var i = 0; i < array.length; i++) {
    var chr = array[i];
    if (chr > 0xFF) {
      if (ASSERTIONS) {
        assert(false, 'Character code ' + chr + ' (' + String.fromCharCode(chr) + ')  at offset ' + i + ' not in 0x00-0xFF.');
      }
      chr &= 0xFF;
    }
    ret.push(String.fromCharCode(chr));
  }
  return ret.join('');
}


// Copied from https://github.com/strophe/strophejs/blob/e06d027/src/polyfills.js#L149

// This code was written by Tyler Akins and has been placed in the
// public domain.  It would be nice if you left this header intact.
// Base64 code from Tyler Akins -- http://rumkin.com

/**
 * Decodes a base64 string.
 * @param {String} input The string to decode.
 */
var decodeBase64 = typeof atob === 'function' ? atob : function (input) {
  var keyStr = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=';

  var output = '';
  var chr1, chr2, chr3;
  var enc1, enc2, enc3, enc4;
  var i = 0;
  // remove all characters that are not A-Z, a-z, 0-9, +, /, or =
  input = input.replace(/[^A-Za-z0-9\+\/\=]/g, '');
  do {
    enc1 = keyStr.indexOf(input.charAt(i++));
    enc2 = keyStr.indexOf(input.charAt(i++));
    enc3 = keyStr.indexOf(input.charAt(i++));
    enc4 = keyStr.indexOf(input.charAt(i++));

    chr1 = (enc1 << 2) | (enc2 >> 4);
    chr2 = ((enc2 & 15) << 4) | (enc3 >> 2);
    chr3 = ((enc3 & 3) << 6) | enc4;

    output = output + String.fromCharCode(chr1);

    if (enc3 !== 64) {
      output = output + String.fromCharCode(chr2);
    }
    if (enc4 !== 64) {
      output = output + String.fromCharCode(chr3);
    }
  } while (i < input.length);
  return output;
};

// Converts a string of base64 into a byte array.
// Throws error on invalid input.
function intArrayFromBase64(s) {
  if (typeof ENVIRONMENT_IS_NODE === 'boolean' && ENVIRONMENT_IS_NODE) {
    var buf;
    try {
      buf = Buffer.from(s, 'base64');
    } catch (_) {
      buf = new Buffer(s, 'base64');
    }
    return new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
  }

  try {
    var decoded = decodeBase64(s);
    var bytes = new Uint8Array(decoded.length);
    for (var i = 0 ; i < decoded.length ; ++i) {
      bytes[i] = decoded.charCodeAt(i);
    }
    return bytes;
  } catch (_) {
    throw new Error('Converting base64 string to bytes failed.');
  }
}

// If filename is a base64 data URI, parses and returns data (Buffer on node,
// Uint8Array otherwise). If filename is not a base64 data URI, returns undefined.
function tryParseAsDataURI(filename) {
  if (!isDataURI(filename)) {
    return;
  }

  return intArrayFromBase64(filename.slice(dataURIPrefix.length));
}



function nullFunc_ii(x) { Module["printErr"]("Invalid function pointer called with signature 'ii'. Perhaps this is an invalid value (e.g. caused by calling a virtual method on a NULL pointer)? Or calling a function with an incorrect type, which will fail? (it is worth building your source files with -Werror (warnings are errors), as warnings can indicate undefined behavior which can cause this)");  Module["printErr"]("Build with ASSERTIONS=2 for more info.");abort(x) }

function nullFunc_iiii(x) { Module["printErr"]("Invalid function pointer called with signature 'iiii'. Perhaps this is an invalid value (e.g. caused by calling a virtual method on a NULL pointer)? Or calling a function with an incorrect type, which will fail? (it is worth building your source files with -Werror (warnings are errors), as warnings can indicate undefined behavior which can cause this)");  Module["printErr"]("Build with ASSERTIONS=2 for more info.");abort(x) }

function nullFunc_vii(x) { Module["printErr"]("Invalid function pointer called with signature 'vii'. Perhaps this is an invalid value (e.g. caused by calling a virtual method on a NULL pointer)? Or calling a function with an incorrect type, which will fail? (it is worth building your source files with -Werror (warnings are errors), as warnings can indicate undefined behavior which can cause this)");  Module["printErr"]("Build with ASSERTIONS=2 for more info.");abort(x) }

function invoke_ii(index,a1) {
  try {
    return Module["dynCall_ii"](index,a1);
  } catch(e) {
    if (typeof e !== 'number' && e !== 'longjmp') throw e;
    Module["setThrew"](1, 0);
  }
}

function invoke_iiii(index,a1,a2,a3) {
  try {
    return Module["dynCall_iiii"](index,a1,a2,a3);
  } catch(e) {
    if (typeof e !== 'number' && e !== 'longjmp') throw e;
    Module["setThrew"](1, 0);
  }
}

function invoke_vii(index,a1,a2) {
  try {
    Module["dynCall_vii"](index,a1,a2);
  } catch(e) {
    if (typeof e !== 'number' && e !== 'longjmp') throw e;
    Module["setThrew"](1, 0);
  }
}

Module.asmGlobalArg = { "Math": Math, "Int8Array": Int8Array, "Int16Array": Int16Array, "Int32Array": Int32Array, "Uint8Array": Uint8Array, "Uint16Array": Uint16Array, "Uint32Array": Uint32Array, "Float32Array": Float32Array, "Float64Array": Float64Array, "NaN": NaN, "Infinity": Infinity };

Module.asmLibraryArg = { "abort": abort, "assert": assert, "enlargeMemory": enlargeMemory, "getTotalMemory": getTotalMemory, "abortOnCannotGrowMemory": abortOnCannotGrowMemory, "abortStackOverflow": abortStackOverflow, "nullFunc_ii": nullFunc_ii, "nullFunc_iiii": nullFunc_iiii, "nullFunc_vii": nullFunc_vii, "invoke_ii": invoke_ii, "invoke_iiii": invoke_iiii, "invoke_vii": invoke_vii, "___lock": ___lock, "___setErrNo": ___setErrNo, "___syscall140": ___syscall140, "___syscall146": ___syscall146, "___syscall54": ___syscall54, "___syscall6": ___syscall6, "___unlock": ___unlock, "__exit": __exit, "_emscripten_memcpy_big": _emscripten_memcpy_big, "_exit": _exit, "flush_NO_FILESYSTEM": flush_NO_FILESYSTEM, "DYNAMICTOP_PTR": DYNAMICTOP_PTR, "tempDoublePtr": tempDoublePtr, "ABORT": ABORT, "STACKTOP": STACKTOP, "STACK_MAX": STACK_MAX, "cttz_i8": cttz_i8 };
// EMSCRIPTEN_START_ASM
var asm = (/** @suppress {uselessCode} */ function(global, env, buffer) {
'almost asm';


  var HEAP8 = new global.Int8Array(buffer);
  var HEAP16 = new global.Int16Array(buffer);
  var HEAP32 = new global.Int32Array(buffer);
  var HEAPU8 = new global.Uint8Array(buffer);
  var HEAPU16 = new global.Uint16Array(buffer);
  var HEAPU32 = new global.Uint32Array(buffer);
  var HEAPF32 = new global.Float32Array(buffer);
  var HEAPF64 = new global.Float64Array(buffer);

  var DYNAMICTOP_PTR=env.DYNAMICTOP_PTR|0;
  var tempDoublePtr=env.tempDoublePtr|0;
  var ABORT=env.ABORT|0;
  var STACKTOP=env.STACKTOP|0;
  var STACK_MAX=env.STACK_MAX|0;
  var cttz_i8=env.cttz_i8|0;

  var __THREW__ = 0;
  var threwValue = 0;
  var setjmpId = 0;
  var undef = 0;
  var nan = global.NaN, inf = global.Infinity;
  var tempInt = 0, tempBigInt = 0, tempBigIntS = 0, tempValue = 0, tempDouble = 0.0;
  var tempRet0 = 0;

  var Math_floor=global.Math.floor;
  var Math_abs=global.Math.abs;
  var Math_sqrt=global.Math.sqrt;
  var Math_pow=global.Math.pow;
  var Math_cos=global.Math.cos;
  var Math_sin=global.Math.sin;
  var Math_tan=global.Math.tan;
  var Math_acos=global.Math.acos;
  var Math_asin=global.Math.asin;
  var Math_atan=global.Math.atan;
  var Math_atan2=global.Math.atan2;
  var Math_exp=global.Math.exp;
  var Math_log=global.Math.log;
  var Math_ceil=global.Math.ceil;
  var Math_imul=global.Math.imul;
  var Math_min=global.Math.min;
  var Math_max=global.Math.max;
  var Math_clz32=global.Math.clz32;
  var abort=env.abort;
  var assert=env.assert;
  var enlargeMemory=env.enlargeMemory;
  var getTotalMemory=env.getTotalMemory;
  var abortOnCannotGrowMemory=env.abortOnCannotGrowMemory;
  var abortStackOverflow=env.abortStackOverflow;
  var nullFunc_ii=env.nullFunc_ii;
  var nullFunc_iiii=env.nullFunc_iiii;
  var nullFunc_vii=env.nullFunc_vii;
  var invoke_ii=env.invoke_ii;
  var invoke_iiii=env.invoke_iiii;
  var invoke_vii=env.invoke_vii;
  var ___lock=env.___lock;
  var ___setErrNo=env.___setErrNo;
  var ___syscall140=env.___syscall140;
  var ___syscall146=env.___syscall146;
  var ___syscall54=env.___syscall54;
  var ___syscall6=env.___syscall6;
  var ___unlock=env.___unlock;
  var __exit=env.__exit;
  var _emscripten_memcpy_big=env._emscripten_memcpy_big;
  var _exit=env._exit;
  var flush_NO_FILESYSTEM=env.flush_NO_FILESYSTEM;
  var tempFloat = 0.0;

// EMSCRIPTEN_START_FUNCS

function stackAlloc(size) {
  size = size|0;
  var ret = 0;
  ret = STACKTOP;
  STACKTOP = (STACKTOP + size)|0;
  STACKTOP = (STACKTOP + 15)&-16;
  if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(size|0);

  return ret|0;
}
function stackSave() {
  return STACKTOP|0;
}
function stackRestore(top) {
  top = top|0;
  STACKTOP = top;
}
function establishStackSpace(stackBase, stackMax) {
  stackBase = stackBase|0;
  stackMax = stackMax|0;
  STACKTOP = stackBase;
  STACK_MAX = stackMax;
}

function setThrew(threw, value) {
  threw = threw|0;
  value = value|0;
  if ((__THREW__|0) == 0) {
    __THREW__ = threw;
    threwValue = value;
  }
}

function setTempRet0(value) {
  value = value|0;
  tempRet0 = value;
}
function getTempRet0() {
  return tempRet0|0;
}

function _fus_array_init($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $10 = 0, $11 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $2 = $0;
 $3 = $1;
 $4 = $3;
 $5 = $2;
 HEAP32[$5>>2] = $4;
 $6 = $2;
 $7 = ((($6)) + 4|0);
 HEAP32[$7>>2] = 0;
 $8 = $2;
 $9 = ((($8)) + 8|0);
 HEAP32[$9>>2] = 0;
 $10 = $2;
 $11 = ((($10)) + 12|0);
 HEAP32[$11>>2] = 0;
 STACKTOP = sp;return;
}
function _fus_array_cleanup($0) {
 $0 = $0|0;
 var $1 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0;
 var $28 = 0, $29 = 0, $3 = 0, $30 = 0, $31 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 32|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(32|0);
 $1 = $0;
 $6 = $1;
 $7 = HEAP32[$6>>2]|0;
 $2 = $7;
 $8 = $2;
 $9 = ((($8)) + 8|0);
 $10 = HEAP32[$9>>2]|0;
 $3 = $10;
 $4 = 0;
 while(1) {
  $11 = $4;
  $12 = $1;
  $13 = ((($12)) + 8|0);
  $14 = HEAP32[$13>>2]|0;
  $15 = ($11|0)<($14|0);
  if (!($15)) {
   break;
  }
  $16 = $1;
  $17 = ((($16)) + 4|0);
  $18 = HEAP32[$17>>2]|0;
  $19 = $4;
  $20 = $3;
  $21 = Math_imul($19, $20)|0;
  $22 = (($18) + ($21)|0);
  $5 = $22;
  $23 = $2;
  $24 = $5;
  _fus_class_instance_cleanup($23,$24);
  $25 = $4;
  $26 = (($25) + 1)|0;
  $4 = $26;
 }
 $27 = $2;
 $28 = HEAP32[$27>>2]|0;
 $29 = $1;
 $30 = ((($29)) + 4|0);
 $31 = HEAP32[$30>>2]|0;
 _fus_free($28,$31);
 STACKTOP = sp;return;
}
function _fus_array_copy($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0;
 var $29 = 0, $3 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $4 = 0, $40 = 0, $41 = 0, $42 = 0, $43 = 0, $5 = 0, $6 = 0, $7 = 0;
 var $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $2 = $0;
 $3 = $1;
 $4 = $3;
 $5 = HEAP32[$4>>2]|0;
 $6 = $2;
 HEAP32[$6>>2] = $5;
 $7 = $2;
 $8 = ((($7)) + 4|0);
 HEAP32[$8>>2] = 0;
 $9 = $3;
 $10 = ((($9)) + 8|0);
 $11 = HEAP32[$10>>2]|0;
 $12 = $2;
 $13 = ((($12)) + 8|0);
 HEAP32[$13>>2] = $11;
 $14 = $3;
 $15 = ((($14)) + 12|0);
 $16 = HEAP32[$15>>2]|0;
 $17 = $2;
 $18 = ((($17)) + 12|0);
 HEAP32[$18>>2] = $16;
 $19 = $2;
 $20 = ((($19)) + 12|0);
 $21 = HEAP32[$20>>2]|0;
 $22 = ($21|0)!=(0);
 if (!($22)) {
  STACKTOP = sp;return;
 }
 $23 = $2;
 $24 = HEAP32[$23>>2]|0;
 $25 = HEAP32[$24>>2]|0;
 $26 = $2;
 $27 = ((($26)) + 12|0);
 $28 = HEAP32[$27>>2]|0;
 $29 = (_fus_malloc($25,$28)|0);
 $30 = $2;
 $31 = ((($30)) + 4|0);
 HEAP32[$31>>2] = $29;
 $32 = $2;
 $33 = HEAP32[$32>>2]|0;
 $34 = HEAP32[$33>>2]|0;
 $35 = $2;
 $36 = ((($35)) + 4|0);
 $37 = HEAP32[$36>>2]|0;
 $38 = $3;
 $39 = ((($38)) + 4|0);
 $40 = HEAP32[$39>>2]|0;
 $41 = $2;
 $42 = ((($41)) + 12|0);
 $43 = HEAP32[$42>>2]|0;
 (_fus_memcpy($34,$37,$40,$43)|0);
 STACKTOP = sp;return;
}
function _fus_array_grow($0,$1,$2) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 var $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0, $29 = 0;
 var $3 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $4 = 0, $40 = 0, $41 = 0, $42 = 0, $43 = 0, $44 = 0, $45 = 0, $46 = 0, $47 = 0;
 var $48 = 0, $49 = 0, $5 = 0, $50 = 0, $51 = 0, $52 = 0, $53 = 0, $54 = 0, $55 = 0, $56 = 0, $57 = 0, $58 = 0, $59 = 0, $6 = 0, $60 = 0, $61 = 0, $62 = 0, $63 = 0, $64 = 0, $65 = 0;
 var $66 = 0, $67 = 0, $68 = 0, $69 = 0, $7 = 0, $70 = 0, $71 = 0, $72 = 0, $73 = 0, $74 = 0, $75 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 48|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(48|0);
 $3 = $0;
 $4 = $1;
 $15 = $2&1;
 $5 = $15;
 $16 = $3;
 $17 = HEAP32[$16>>2]|0;
 $6 = $17;
 $18 = $6;
 $19 = HEAP32[$18>>2]|0;
 $7 = $19;
 $20 = $6;
 $21 = ((($20)) + 8|0);
 $22 = HEAP32[$21>>2]|0;
 $8 = $22;
 $23 = $4;
 $24 = $8;
 $25 = Math_imul($23, $24)|0;
 $9 = $25;
 $26 = $3;
 $27 = ((($26)) + 12|0);
 $28 = HEAP32[$27>>2]|0;
 $10 = $28;
 $29 = $10;
 $30 = ($29|0)==(0);
 if ($30) {
  $31 = $9;
  $10 = $31;
 }
 while(1) {
  $32 = $10;
  $33 = $9;
  $34 = ($32>>>0)<($33>>>0);
  $35 = $10;
  if (!($34)) {
   break;
  }
  $36 = $35<<1;
  $10 = $36;
 }
 $37 = $3;
 $38 = ((($37)) + 12|0);
 $39 = HEAP32[$38>>2]|0;
 $40 = ($35|0)!=($39|0);
 if ($40) {
  $41 = $7;
  $42 = $3;
  $43 = ((($42)) + 4|0);
  $44 = HEAP32[$43>>2]|0;
  $45 = $10;
  $46 = (_fus_realloc($41,$44,$45)|0);
  $11 = $46;
  $47 = $11;
  $48 = $3;
  $49 = ((($48)) + 4|0);
  HEAP32[$49>>2] = $47;
  $50 = $10;
  $51 = $3;
  $52 = ((($51)) + 12|0);
  HEAP32[$52>>2] = $50;
 }
 $53 = $5;
 $54 = $53&1;
 if (!($54)) {
  $73 = $4;
  $74 = $3;
  $75 = ((($74)) + 8|0);
  HEAP32[$75>>2] = $73;
  STACKTOP = sp;return;
 }
 $55 = $3;
 $56 = ((($55)) + 4|0);
 $57 = HEAP32[$56>>2]|0;
 $12 = $57;
 $58 = $3;
 $59 = ((($58)) + 8|0);
 $60 = HEAP32[$59>>2]|0;
 $13 = $60;
 while(1) {
  $61 = $13;
  $62 = $4;
  $63 = ($61|0)<($62|0);
  if (!($63)) {
   break;
  }
  $64 = $12;
  $65 = $13;
  $66 = $8;
  $67 = Math_imul($65, $66)|0;
  $68 = (($64) + ($67)|0);
  $14 = $68;
  $69 = $6;
  $70 = $14;
  _fus_class_instance_init($69,$70);
  $71 = $13;
  $72 = (($71) + 1)|0;
  $13 = $72;
 }
 $73 = $4;
 $74 = $3;
 $75 = ((($74)) + 8|0);
 HEAP32[$75>>2] = $73;
 STACKTOP = sp;return;
}
function _fus_array_shrink($0,$1,$2) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 var $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0, $29 = 0;
 var $3 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $4 = 0, $40 = 0, $41 = 0, $42 = 0, $43 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0;
 var $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 48|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(48|0);
 $3 = $0;
 $4 = $1;
 $12 = $2&1;
 $5 = $12;
 $13 = $3;
 $14 = HEAP32[$13>>2]|0;
 $6 = $14;
 $15 = $6;
 $16 = HEAP32[$15>>2]|0;
 $7 = $16;
 $17 = $6;
 $18 = ((($17)) + 8|0);
 $19 = HEAP32[$18>>2]|0;
 $8 = $19;
 $20 = $5;
 $21 = $20&1;
 if (!($21)) {
  $41 = $4;
  $42 = $3;
  $43 = ((($42)) + 8|0);
  HEAP32[$43>>2] = $41;
  STACKTOP = sp;return;
 }
 $22 = $3;
 $23 = ((($22)) + 4|0);
 $24 = HEAP32[$23>>2]|0;
 $9 = $24;
 $25 = $3;
 $26 = ((($25)) + 8|0);
 $27 = HEAP32[$26>>2]|0;
 $28 = (($27) - 1)|0;
 $10 = $28;
 while(1) {
  $29 = $10;
  $30 = $4;
  $31 = ($29|0)>=($30|0);
  if (!($31)) {
   break;
  }
  $32 = $9;
  $33 = $10;
  $34 = $8;
  $35 = Math_imul($33, $34)|0;
  $36 = (($32) + ($35)|0);
  $11 = $36;
  $37 = $6;
  $38 = $11;
  _fus_class_instance_cleanup($37,$38);
  $39 = $10;
  $40 = (($39) + -1)|0;
  $10 = $40;
 }
 $41 = $4;
 $42 = $3;
 $43 = ((($42)) + 8|0);
 HEAP32[$43>>2] = $41;
 STACKTOP = sp;return;
}
function _fus_array_push($0) {
 $0 = $0|0;
 var $1 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $1 = $0;
 $2 = $1;
 $3 = $1;
 $4 = ((($3)) + 8|0);
 $5 = HEAP32[$4>>2]|0;
 $6 = (($5) + 1)|0;
 _fus_array_grow($2,$6,0);
 STACKTOP = sp;return;
}
function _fus_array_pop($0) {
 $0 = $0|0;
 var $1 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $1 = $0;
 $2 = $1;
 $3 = $1;
 $4 = ((($3)) + 8|0);
 $5 = HEAP32[$4>>2]|0;
 $6 = (($5) - 1)|0;
 _fus_array_shrink($2,$6,0);
 STACKTOP = sp;return;
}
function _fus_array_lshift($0) {
 $0 = $0|0;
 var $1 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0;
 var $28 = 0, $29 = 0, $3 = 0, $30 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 32|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(32|0);
 $1 = $0;
 $6 = $1;
 $7 = ((($6)) + 8|0);
 $8 = HEAP32[$7>>2]|0;
 $9 = ($8|0)<=(1);
 if ($9) {
  STACKTOP = sp;return;
 }
 $10 = $1;
 $11 = HEAP32[$10>>2]|0;
 $2 = $11;
 $12 = $2;
 $13 = HEAP32[$12>>2]|0;
 $3 = $13;
 $14 = $2;
 $15 = ((($14)) + 8|0);
 $16 = HEAP32[$15>>2]|0;
 $4 = $16;
 $17 = $1;
 $18 = ((($17)) + 4|0);
 $19 = HEAP32[$18>>2]|0;
 $5 = $19;
 $20 = $3;
 $21 = $5;
 $22 = $5;
 $23 = $4;
 $24 = (($22) + ($23)|0);
 $25 = $1;
 $26 = ((($25)) + 8|0);
 $27 = HEAP32[$26>>2]|0;
 $28 = (($27) - 1)|0;
 $29 = $4;
 $30 = Math_imul($28, $29)|0;
 (_fus_memmove($20,$21,$24,$30)|0);
 STACKTOP = sp;return;
}
function _fus_array_rshift($0) {
 $0 = $0|0;
 var $1 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0;
 var $28 = 0, $29 = 0, $3 = 0, $30 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 32|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(32|0);
 $1 = $0;
 $6 = $1;
 $7 = ((($6)) + 8|0);
 $8 = HEAP32[$7>>2]|0;
 $9 = ($8|0)<=(1);
 if ($9) {
  STACKTOP = sp;return;
 }
 $10 = $1;
 $11 = HEAP32[$10>>2]|0;
 $2 = $11;
 $12 = $2;
 $13 = HEAP32[$12>>2]|0;
 $3 = $13;
 $14 = $2;
 $15 = ((($14)) + 8|0);
 $16 = HEAP32[$15>>2]|0;
 $4 = $16;
 $17 = $1;
 $18 = ((($17)) + 4|0);
 $19 = HEAP32[$18>>2]|0;
 $5 = $19;
 $20 = $3;
 $21 = $5;
 $22 = $4;
 $23 = (($21) + ($22)|0);
 $24 = $5;
 $25 = $1;
 $26 = ((($25)) + 8|0);
 $27 = HEAP32[$26>>2]|0;
 $28 = (($27) - 1)|0;
 $29 = $4;
 $30 = Math_imul($28, $29)|0;
 (_fus_memmove($20,$23,$24,$30)|0);
 STACKTOP = sp;return;
}
function _fus_class_init_array($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $2 = $0;
 $3 = $1;
 $5 = $3;
 $4 = $5;
 $6 = $4;
 _fus_array_init($6,0);
 STACKTOP = sp;return;
}
function _fus_class_cleanup_array($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $2 = $0;
 $3 = $1;
 $5 = $3;
 $4 = $5;
 $6 = $4;
 _fus_array_cleanup($6);
 STACKTOP = sp;return;
}
function _fus_arr_init($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $2 = $0;
 $3 = $1;
 $4 = $3;
 $5 = $2;
 $6 = ((($5)) + 120|0);
 _fus_array_init($4,$6);
 STACKTOP = sp;return;
}
function _fus_arr_copy($0,$1,$2) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 var $$byval_copy = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $3 = 0, $4 = 0, $5 = 0;
 var $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 32|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(32|0);
 $$byval_copy = sp + 24|0;
 $3 = $0;
 $4 = $1;
 $5 = $2;
 $9 = $4;
 $10 = $5;
 _fus_array_copy($9,$10);
 $11 = $5;
 $12 = ((($11)) + 4|0);
 $13 = HEAP32[$12>>2]|0;
 $6 = $13;
 $14 = $5;
 $15 = ((($14)) + 8|0);
 $16 = HEAP32[$15>>2]|0;
 $7 = $16;
 $8 = 0;
 while(1) {
  $17 = $8;
  $18 = $7;
  $19 = ($17|0)<($18|0);
  if (!($19)) {
   break;
  }
  $20 = $3;
  $21 = $6;
  $22 = $8;
  $23 = (($21) + ($22<<2)|0);
  ;HEAP32[$$byval_copy>>2]=HEAP32[$23>>2]|0;
  _fus_value_attach($20,$$byval_copy);
  $24 = $8;
  $25 = (($24) + 1)|0;
  $8 = $25;
 }
 STACKTOP = sp;return;
}
function _fus_arr_cleanup($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $2 = 0, $3 = 0, $4 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $2 = $0;
 $3 = $1;
 $4 = $3;
 _fus_array_cleanup($4);
 STACKTOP = sp;return;
}
function _fus_arr_len($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $2 = $0;
 $3 = $1;
 $4 = $3;
 $5 = ((($4)) + 8|0);
 $6 = HEAP32[$5>>2]|0;
 STACKTOP = sp;return ($6|0);
}
function _fus_arr_get($0,$1,$2,$3) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 $3 = $3|0;
 var $10 = 0, $11 = 0, $12 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $7 = sp;
 $4 = $1;
 $5 = $2;
 $6 = $3;
 $8 = $5;
 $9 = ((($8)) + 4|0);
 $10 = HEAP32[$9>>2]|0;
 $11 = $6;
 $12 = (($10) + ($11<<2)|0);
 ;HEAP32[$7>>2]=HEAP32[$12>>2]|0;
 ;HEAP32[$0>>2]=HEAP32[$7>>2]|0;
 STACKTOP = sp;return;
}
function _fus_arr_set($0,$1,$2,$3) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 $3 = $3|0;
 var $$byval_copy = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0;
 var $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 32|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(32|0);
 $$byval_copy = sp + 20|0;
 $5 = $0;
 $6 = $1;
 $7 = $2;
 $9 = $7;
 $10 = ($9|0)<(0);
 if (!($10)) {
  $11 = $7;
  $12 = $6;
  $13 = ((($12)) + 8|0);
  $14 = HEAP32[$13>>2]|0;
  $15 = ($11|0)>=($14|0);
  if (!($15)) {
   $16 = $6;
   $17 = ((($16)) + 4|0);
   $18 = HEAP32[$17>>2]|0;
   $19 = $7;
   $20 = (($18) + ($19<<2)|0);
   $8 = $20;
   $21 = $5;
   $22 = $8;
   ;HEAP32[$$byval_copy>>2]=HEAP32[$22>>2]|0;
   _fus_value_detach($21,$$byval_copy);
   $23 = $8;
   ;HEAP32[$23>>2]=HEAP32[$3>>2]|0;
   $4 = 0;
   $24 = $4;
   STACKTOP = sp;return ($24|0);
  }
 }
 $4 = -1;
 $24 = $4;
 STACKTOP = sp;return ($24|0);
}
function _fus_arr_push($0,$1,$2) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 var $$byval_copy = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $$byval_copy = sp + 8|0;
 $3 = $0;
 $4 = $1;
 $5 = $3;
 $6 = $4;
 ;HEAP32[$$byval_copy>>2]=HEAP32[$2>>2]|0;
 __fus_arr_push($5,$6,$$byval_copy,0);
 STACKTOP = sp;return;
}
function __fus_arr_push($0,$1,$2,$3) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 $3 = $3|0;
 var $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $20 = 0, $21 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $4 = $0;
 $5 = $1;
 $7 = $3&1;
 $6 = $7;
 $8 = $5;
 _fus_array_push($8);
 $9 = $6;
 $10 = $9&1;
 $11 = $5;
 if ($10) {
  _fus_array_rshift($11);
  $12 = $5;
  $13 = ((($12)) + 4|0);
  $14 = HEAP32[$13>>2]|0;
  ;HEAP32[$14>>2]=HEAP32[$2>>2]|0;
  STACKTOP = sp;return;
 } else {
  $15 = ((($11)) + 4|0);
  $16 = HEAP32[$15>>2]|0;
  $17 = $5;
  $18 = ((($17)) + 8|0);
  $19 = HEAP32[$18>>2]|0;
  $20 = (($19) - 1)|0;
  $21 = (($16) + ($20<<2)|0);
  ;HEAP32[$21>>2]=HEAP32[$2>>2]|0;
  STACKTOP = sp;return;
 }
}
function _fus_arr_lpush($0,$1,$2) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 var $$byval_copy = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $$byval_copy = sp + 8|0;
 $3 = $0;
 $4 = $1;
 $5 = $3;
 $6 = $4;
 ;HEAP32[$$byval_copy>>2]=HEAP32[$2>>2]|0;
 __fus_arr_push($5,$6,$$byval_copy,1);
 STACKTOP = sp;return;
}
function _fus_arr_pop($0,$1,$2) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 var $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $3 = $0;
 $4 = $1;
 $5 = $2;
 $6 = $3;
 $7 = $4;
 $8 = $5;
 $9 = (__fus_arr_pop($6,$7,$8,0)|0);
 STACKTOP = sp;return ($9|0);
}
function __fus_arr_pop($0,$1,$2,$3) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 $3 = $3|0;
 var $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0, $29 = 0;
 var $30 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 32|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(32|0);
 $9 = sp;
 $5 = $0;
 $6 = $1;
 $7 = $2;
 $10 = $3&1;
 $8 = $10;
 $11 = $6;
 $12 = ((($11)) + 8|0);
 $13 = HEAP32[$12>>2]|0;
 $14 = ($13|0)<=(0);
 if ($14) {
  $15 = $7;
  $16 = $5;
  _fus_value_err($9,$16,3);
  ;HEAP32[$15>>2]=HEAP32[$9>>2]|0;
  $4 = -1;
  $30 = $4;
  STACKTOP = sp;return ($30|0);
 }
 $17 = $8;
 $18 = $17&1;
 $19 = $7;
 $20 = $6;
 $21 = ((($20)) + 4|0);
 $22 = HEAP32[$21>>2]|0;
 if ($18) {
  ;HEAP32[$19>>2]=HEAP32[$22>>2]|0;
  $23 = $6;
  _fus_array_lshift($23);
 } else {
  $24 = $6;
  $25 = ((($24)) + 8|0);
  $26 = HEAP32[$25>>2]|0;
  $27 = (($26) - 1)|0;
  $28 = (($22) + ($27<<2)|0);
  ;HEAP32[$19>>2]=HEAP32[$28>>2]|0;
 }
 $29 = $6;
 _fus_array_pop($29);
 $4 = 0;
 $30 = $4;
 STACKTOP = sp;return ($30|0);
}
function _fus_arr_lpop($0,$1,$2) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 var $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $3 = $0;
 $4 = $1;
 $5 = $2;
 $6 = $3;
 $7 = $4;
 $8 = $5;
 $9 = (__fus_arr_pop($6,$7,$8,1)|0);
 STACKTOP = sp;return ($9|0);
}
function _fus_boxed_arr_mkunique($0) {
 $0 = $0|0;
 var $1 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0;
 var $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $4 = sp;
 $1 = $0;
 $5 = $1;
 $6 = HEAP32[$5>>2]|0;
 $2 = $6;
 $7 = $2;
 $8 = ((($7)) + 8|0);
 $9 = HEAP32[$8>>2]|0;
 $10 = ($9|0)>(1);
 if (!($10)) {
  STACKTOP = sp;return;
 }
 $11 = $2;
 _fus_boxed_detach($11);
 $12 = $2;
 $13 = HEAP32[$12>>2]|0;
 _fus_value_arr($4,$13);
 $14 = HEAP32[$4>>2]|0;
 $3 = $14;
 $15 = $2;
 $16 = HEAP32[$15>>2]|0;
 $17 = $3;
 $18 = ((($17)) + 12|0);
 $19 = $2;
 $20 = ((($19)) + 12|0);
 _fus_arr_copy($16,$18,$20);
 $21 = $3;
 $22 = $1;
 HEAP32[$22>>2] = $21;
 STACKTOP = sp;return;
}
function _fus_value_arr($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $10 = 0, $11 = 0, $12 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $2 = $1;
 $4 = $2;
 $5 = HEAP32[$4>>2]|0;
 $6 = (_fus_malloc($5,68)|0);
 $3 = $6;
 $7 = $3;
 $8 = $2;
 _fus_boxed_init($7,$8,0);
 $9 = $2;
 $10 = $3;
 $11 = ((($10)) + 12|0);
 _fus_arr_init($9,$11);
 $12 = $3;
 HEAP32[$0>>2] = $12;
 STACKTOP = sp;return;
}
function _fus_value_arr_from_arr($0,$1,$2) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 var $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $3 = $1;
 $4 = $2;
 $6 = $3;
 $7 = HEAP32[$6>>2]|0;
 $8 = (_fus_malloc($7,68)|0);
 $5 = $8;
 $9 = $5;
 $10 = $3;
 _fus_boxed_init($9,$10,0);
 $11 = $5;
 $12 = ((($11)) + 12|0);
 $13 = $4;
 ;HEAP32[$12>>2]=HEAP32[$13>>2]|0;HEAP32[$12+4>>2]=HEAP32[$13+4>>2]|0;HEAP32[$12+8>>2]=HEAP32[$13+8>>2]|0;HEAP32[$12+12>>2]=HEAP32[$13+12>>2]|0;
 $14 = $5;
 HEAP32[$0>>2] = $14;
 STACKTOP = sp;return;
}
function _fus_value_arr_len($0,$1,$2) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 var $$byval_copy = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $$byval_copy = sp + 4|0;
 $3 = $1;
 ;HEAP32[$$byval_copy>>2]=HEAP32[$2>>2]|0;
 $4 = (_fus_value_is_arr($$byval_copy)|0);
 $5 = $3;
 if ($4) {
  $6 = $3;
  $7 = HEAP32[$2>>2]|0;
  $8 = ((($7)) + 12|0);
  $9 = (_fus_arr_len($6,$8)|0);
  _fus_value_int($0,$5,$9);
  STACKTOP = sp;return;
 } else {
  _fus_value_err($0,$5,0);
  STACKTOP = sp;return;
 }
}
function _fus_value_arr_get_i($0,$1,$2,$3) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 $3 = $3|0;
 var $$byval_copy = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0, $4 = 0;
 var $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, $vararg_buffer = 0, $vararg_ptr1 = 0, $vararg_ptr2 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 48|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(48|0);
 $$byval_copy = sp + 32|0;
 $vararg_buffer = sp;
 $8 = sp + 12|0;
 $4 = $1;
 $5 = $3;
 ;HEAP32[$$byval_copy>>2]=HEAP32[$2>>2]|0;
 $9 = (_fus_value_is_arr($$byval_copy)|0);
 if (!($9)) {
  $10 = $4;
  _fus_value_err($0,$10,0);
  STACKTOP = sp;return;
 }
 $11 = HEAP32[$2>>2]|0;
 $12 = ((($11)) + 12|0);
 $6 = $12;
 $13 = $4;
 $14 = $6;
 $15 = (_fus_arr_len($13,$14)|0);
 $7 = $15;
 $16 = $5;
 $17 = ($16|0)<(0);
 if (!($17)) {
  $18 = $5;
  $19 = $7;
  $20 = ($18|0)>=($19|0);
  if (!($20)) {
   $25 = $4;
   $26 = $6;
   $27 = $5;
   _fus_arr_get($8,$25,$26,$27);
   ;HEAP32[$0>>2]=HEAP32[$8>>2]|0;
   STACKTOP = sp;return;
  }
 }
 $21 = HEAP32[54]|0;
 $22 = $5;
 $23 = $7;
 HEAP32[$vararg_buffer>>2] = 627;
 $vararg_ptr1 = ((($vararg_buffer)) + 4|0);
 HEAP32[$vararg_ptr1>>2] = $22;
 $vararg_ptr2 = ((($vararg_buffer)) + 8|0);
 HEAP32[$vararg_ptr2>>2] = $23;
 (_fprintf($21,588,$vararg_buffer)|0);
 $24 = $4;
 _fus_value_err($0,$24,3);
 STACKTOP = sp;return;
}
function _fus_value_arr_set_i($0,$1,$2,$3) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 $3 = $3|0;
 var $$byval_copy = 0, $$byval_copy3 = 0, $$byval_copy4 = 0, $$byval_copy5 = 0, $$byval_copy6 = 0, $$byval_copy7 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0;
 var $24 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0, $29 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $4 = 0, $40 = 0, $41 = 0, $5 = 0;
 var $6 = 0, $7 = 0, $8 = 0, $9 = 0, $vararg_buffer = 0, $vararg_ptr1 = 0, $vararg_ptr2 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 80|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(80|0);
 $$byval_copy7 = sp + 68|0;
 $$byval_copy6 = sp + 64|0;
 $$byval_copy5 = sp + 60|0;
 $$byval_copy4 = sp + 56|0;
 $$byval_copy3 = sp + 52|0;
 $$byval_copy = sp + 48|0;
 $vararg_buffer = sp;
 $7 = sp + 32|0;
 $8 = sp + 28|0;
 $11 = sp + 16|0;
 $4 = $0;
 $5 = $1;
 $6 = $2;
 $13 = $5;
 ;HEAP32[$7>>2]=HEAP32[$13>>2]|0;
 ;HEAP32[$$byval_copy>>2]=HEAP32[$7>>2]|0;
 $14 = (_fus_value_is_arr($$byval_copy)|0);
 if (!($14)) {
  $15 = $4;
  ;HEAP32[$$byval_copy3>>2]=HEAP32[$7>>2]|0;
  _fus_value_detach($15,$$byval_copy3);
  $16 = $4;
  ;HEAP32[$$byval_copy4>>2]=HEAP32[$3>>2]|0;
  _fus_value_detach($16,$$byval_copy4);
  $17 = $5;
  $18 = $4;
  _fus_value_err($8,$18,0);
  ;HEAP32[$17>>2]=HEAP32[$8>>2]|0;
  STACKTOP = sp;return;
 }
 $19 = HEAP32[$7>>2]|0;
 $20 = ((($19)) + 12|0);
 $9 = $20;
 $21 = $4;
 $22 = $9;
 $23 = (_fus_arr_len($21,$22)|0);
 $10 = $23;
 $24 = $6;
 $25 = ($24|0)<(0);
 if (!($25)) {
  $26 = $6;
  $27 = $10;
  $28 = ($26|0)>=($27|0);
  if (!($28)) {
   _fus_boxed_arr_mkunique($7);
   $36 = HEAP32[$7>>2]|0;
   $37 = ((($36)) + 12|0);
   $12 = $37;
   $38 = $4;
   $39 = $12;
   $40 = $6;
   ;HEAP32[$$byval_copy7>>2]=HEAP32[$3>>2]|0;
   (_fus_arr_set($38,$39,$40,$$byval_copy7)|0);
   $41 = $5;
   ;HEAP32[$41>>2]=HEAP32[$7>>2]|0;
   STACKTOP = sp;return;
  }
 }
 $29 = HEAP32[54]|0;
 $30 = $6;
 $31 = $10;
 HEAP32[$vararg_buffer>>2] = 647;
 $vararg_ptr1 = ((($vararg_buffer)) + 4|0);
 HEAP32[$vararg_ptr1>>2] = $30;
 $vararg_ptr2 = ((($vararg_buffer)) + 8|0);
 HEAP32[$vararg_ptr2>>2] = $31;
 (_fprintf($29,588,$vararg_buffer)|0);
 $32 = $4;
 ;HEAP32[$$byval_copy5>>2]=HEAP32[$7>>2]|0;
 _fus_value_detach($32,$$byval_copy5);
 $33 = $4;
 ;HEAP32[$$byval_copy6>>2]=HEAP32[$3>>2]|0;
 _fus_value_detach($33,$$byval_copy6);
 $34 = $5;
 $35 = $4;
 _fus_value_err($11,$35,3);
 ;HEAP32[$34>>2]=HEAP32[$11>>2]|0;
 STACKTOP = sp;return;
}
function _fus_value_arr_push($0,$1,$2) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 var $$byval_copy = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $$byval_copy = sp + 8|0;
 $3 = $0;
 $4 = $1;
 $5 = $3;
 $6 = $4;
 ;HEAP32[$$byval_copy>>2]=HEAP32[$2>>2]|0;
 __fus_value_arr_push($5,$6,$$byval_copy,0);
 STACKTOP = sp;return;
}
function __fus_value_arr_push($0,$1,$2,$3) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 $3 = $3|0;
 var $$byval_copy = 0, $$byval_copy1 = 0, $$byval_copy2 = 0, $$byval_copy3 = 0, $$byval_copy4 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $4 = 0;
 var $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 48|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(48|0);
 $$byval_copy4 = sp + 36|0;
 $$byval_copy3 = sp + 32|0;
 $$byval_copy2 = sp + 28|0;
 $$byval_copy1 = sp + 24|0;
 $$byval_copy = sp + 20|0;
 $7 = sp + 8|0;
 $8 = sp + 4|0;
 $4 = $0;
 $5 = $1;
 $10 = $3&1;
 $6 = $10;
 $11 = $5;
 ;HEAP32[$7>>2]=HEAP32[$11>>2]|0;
 ;HEAP32[$$byval_copy>>2]=HEAP32[$7>>2]|0;
 $12 = (_fus_value_is_arr($$byval_copy)|0);
 if (!($12)) {
  $13 = $4;
  ;HEAP32[$$byval_copy1>>2]=HEAP32[$7>>2]|0;
  _fus_value_detach($13,$$byval_copy1);
  $14 = $4;
  ;HEAP32[$$byval_copy2>>2]=HEAP32[$2>>2]|0;
  _fus_value_detach($14,$$byval_copy2);
  $15 = $5;
  $16 = $4;
  _fus_value_err($8,$16,0);
  ;HEAP32[$15>>2]=HEAP32[$8>>2]|0;
  STACKTOP = sp;return;
 }
 _fus_boxed_arr_mkunique($7);
 $17 = HEAP32[$7>>2]|0;
 $18 = ((($17)) + 12|0);
 $9 = $18;
 $19 = $6;
 $20 = $19&1;
 $21 = $4;
 $22 = $9;
 if ($20) {
  ;HEAP32[$$byval_copy3>>2]=HEAP32[$2>>2]|0;
  _fus_arr_lpush($21,$22,$$byval_copy3);
 } else {
  ;HEAP32[$$byval_copy4>>2]=HEAP32[$2>>2]|0;
  _fus_arr_push($21,$22,$$byval_copy4);
 }
 $23 = $5;
 ;HEAP32[$23>>2]=HEAP32[$7>>2]|0;
 STACKTOP = sp;return;
}
function _fus_value_arr_pop($0,$1,$2) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 var $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $3 = $0;
 $4 = $1;
 $5 = $2;
 $6 = $3;
 $7 = $4;
 $8 = $5;
 __fus_value_arr_pop($6,$7,$8,0);
 STACKTOP = sp;return;
}
function __fus_value_arr_pop($0,$1,$2,$3) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 $3 = $3|0;
 var $$byval_copy = 0, $$byval_copy1 = 0, $$byval_copy2 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0;
 var $27 = 0, $28 = 0, $29 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 64|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(64|0);
 $$byval_copy2 = sp + 44|0;
 $$byval_copy1 = sp + 40|0;
 $$byval_copy = sp + 36|0;
 $8 = sp + 20|0;
 $9 = sp + 16|0;
 $10 = sp + 12|0;
 $13 = sp;
 $4 = $0;
 $5 = $1;
 $6 = $2;
 $14 = $3&1;
 $7 = $14;
 $15 = $5;
 ;HEAP32[$8>>2]=HEAP32[$15>>2]|0;
 ;HEAP32[$$byval_copy>>2]=HEAP32[$8>>2]|0;
 $16 = (_fus_value_is_arr($$byval_copy)|0);
 if (!($16)) {
  $17 = $4;
  ;HEAP32[$$byval_copy1>>2]=HEAP32[$8>>2]|0;
  _fus_value_detach($17,$$byval_copy1);
  $18 = $5;
  $19 = $4;
  _fus_value_err($9,$19,0);
  ;HEAP32[$18>>2]=HEAP32[$9>>2]|0;
  $20 = $6;
  $21 = $4;
  _fus_value_err($10,$21,0);
  ;HEAP32[$20>>2]=HEAP32[$10>>2]|0;
  STACKTOP = sp;return;
 }
 _fus_boxed_arr_mkunique($8);
 $22 = HEAP32[$8>>2]|0;
 $23 = ((($22)) + 12|0);
 $11 = $23;
 $24 = $7;
 $25 = $24&1;
 $26 = $4;
 $27 = $11;
 $28 = $6;
 if ($25) {
  $29 = (_fus_arr_lpop($26,$27,$28)|0);
  $31 = $29;
 } else {
  $30 = (_fus_arr_pop($26,$27,$28)|0);
  $31 = $30;
 }
 $12 = $31;
 $32 = $12;
 $33 = ($32|0)<(0);
 if ($33) {
  $34 = $4;
  ;HEAP32[$$byval_copy2>>2]=HEAP32[$8>>2]|0;
  _fus_value_detach($34,$$byval_copy2);
  $35 = $5;
  $36 = $4;
  _fus_value_err($13,$36,3);
  ;HEAP32[$35>>2]=HEAP32[$13>>2]|0;
  STACKTOP = sp;return;
 } else {
  $37 = $5;
  ;HEAP32[$37>>2]=HEAP32[$8>>2]|0;
  STACKTOP = sp;return;
 }
}
function _fus_class_init_arr($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $10 = 0, $11 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $2 = $0;
 $3 = $1;
 $6 = $3;
 $4 = $6;
 $7 = $2;
 $8 = ((($7)) + 12|0);
 $9 = HEAP32[$8>>2]|0;
 $5 = $9;
 $10 = $5;
 $11 = $4;
 _fus_arr_init($10,$11);
 STACKTOP = sp;return;
}
function _fus_class_cleanup_arr($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $10 = 0, $11 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $2 = $0;
 $3 = $1;
 $6 = $3;
 $4 = $6;
 $7 = $2;
 $8 = ((($7)) + 12|0);
 $9 = HEAP32[$8>>2]|0;
 $5 = $9;
 $10 = $5;
 $11 = $4;
 _fus_arr_cleanup($10,$11);
 STACKTOP = sp;return;
}
function _fus_boxed_type_msg($0) {
 $0 = $0|0;
 var $1 = 0, $10 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, $or$cond = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $2 = $0;
 $3 = $2;
 $4 = ($3>>>0)<(0);
 $5 = $2;
 $6 = ($5>>>0)>=(4);
 $or$cond = $4 | $6;
 if ($or$cond) {
  $1 = 2101;
 } else {
  $7 = $2;
  $8 = (8 + ($7<<2)|0);
  $9 = HEAP32[$8>>2]|0;
  $1 = $9;
 }
 $10 = $1;
 STACKTOP = sp;return ($10|0);
}
function _fus_boxed_dump($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $10 = 0, $11 = 0, $12 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, $vararg_buffer = 0, $vararg_ptr1 = 0, $vararg_ptr2 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 32|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(32|0);
 $vararg_buffer = sp;
 $2 = $0;
 $3 = $1;
 $4 = $3;
 $5 = $2;
 $6 = $2;
 $7 = ((($6)) + 4|0);
 $8 = HEAP32[$7>>2]|0;
 $9 = (_fus_boxed_type_msg($8)|0);
 $10 = $2;
 $11 = ((($10)) + 8|0);
 $12 = HEAP32[$11>>2]|0;
 HEAP32[$vararg_buffer>>2] = $5;
 $vararg_ptr1 = ((($vararg_buffer)) + 4|0);
 HEAP32[$vararg_ptr1>>2] = $9;
 $vararg_ptr2 = ((($vararg_buffer)) + 8|0);
 HEAP32[$vararg_ptr2>>2] = $12;
 (_fprintf($4,667,$vararg_buffer)|0);
 STACKTOP = sp;return;
}
function _fus_boxed_init($0,$1,$2) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 var $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0, $29 = 0;
 var $3 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $3 = $0;
 $4 = $1;
 $5 = $2;
 $6 = $3;
 $7 = ($6|0)==(0|0);
 if ($7) {
  STACKTOP = sp;return;
 }
 $8 = $4;
 $9 = $3;
 HEAP32[$9>>2] = $8;
 $10 = $5;
 $11 = $3;
 $12 = ((($11)) + 4|0);
 HEAP32[$12>>2] = $10;
 $13 = $3;
 $14 = ((($13)) + 8|0);
 HEAP32[$14>>2] = 1;
 $15 = $4;
 $16 = ((($15)) + 8|0);
 $17 = HEAP32[$16>>2]|0;
 $18 = (($17) + 1)|0;
 HEAP32[$16>>2] = $18;
 $19 = $3;
 $20 = ((($19)) + 60|0);
 HEAP32[$20>>2] = 0;
 $21 = $4;
 $22 = ((($21)) + 20|0);
 $23 = HEAP32[$22>>2]|0;
 $24 = $3;
 $25 = ((($24)) + 64|0);
 HEAP32[$25>>2] = $23;
 $26 = $3;
 $27 = ((($26)) + 64|0);
 $28 = HEAP32[$27>>2]|0;
 $29 = ($28|0)!=(0|0);
 if ($29) {
  $30 = $3;
  $31 = $3;
  $32 = ((($31)) + 64|0);
  $33 = HEAP32[$32>>2]|0;
  $34 = ((($33)) + 60|0);
  HEAP32[$34>>2] = $30;
 }
 $35 = $3;
 $36 = $4;
 $37 = ((($36)) + 20|0);
 HEAP32[$37>>2] = $35;
 STACKTOP = sp;return;
}
function _fus_boxed_cleanup($0) {
 $0 = $0|0;
 var $1 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0;
 var $28 = 0, $29 = 0, $3 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $4 = 0, $40 = 0, $41 = 0, $42 = 0, $43 = 0, $44 = 0, $45 = 0;
 var $46 = 0, $47 = 0, $48 = 0, $49 = 0, $5 = 0, $50 = 0, $51 = 0, $52 = 0, $53 = 0, $54 = 0, $55 = 0, $56 = 0, $57 = 0, $58 = 0, $59 = 0, $6 = 0, $60 = 0, $61 = 0, $62 = 0, $63 = 0;
 var $64 = 0, $65 = 0, $66 = 0, $67 = 0, $68 = 0, $69 = 0, $7 = 0, $70 = 0, $71 = 0, $72 = 0, $73 = 0, $74 = 0, $75 = 0, $76 = 0, $77 = 0, $78 = 0, $79 = 0, $8 = 0, $80 = 0, $81 = 0;
 var $82 = 0, $9 = 0, $vararg_buffer = 0, $vararg_buffer1 = 0, $vararg_ptr4 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 64|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(64|0);
 $vararg_buffer1 = sp + 8|0;
 $vararg_buffer = sp;
 $1 = $0;
 $10 = $1;
 $11 = ($10|0)==(0|0);
 if ($11) {
  STACKTOP = sp;return;
 }
 $12 = $1;
 $13 = ((($12)) + 8|0);
 $14 = HEAP32[$13>>2]|0;
 $15 = ($14|0)!=(0);
 if ($15) {
  $16 = HEAP32[54]|0;
  HEAP32[$vararg_buffer>>2] = 755;
  (_fprintf($16,701,$vararg_buffer)|0);
  $17 = $1;
  $18 = HEAP32[54]|0;
  _fus_boxed_dump($17,$18);
  $19 = HEAP32[54]|0;
  (_fflush($19)|0);
 }
 $20 = $1;
 $21 = HEAP32[$20>>2]|0;
 $2 = $21;
 $22 = $2;
 $23 = ((($22)) + 8|0);
 $24 = HEAP32[$23>>2]|0;
 $25 = (($24) + -1)|0;
 HEAP32[$23>>2] = $25;
 $26 = $1;
 $27 = ((($26)) + 60|0);
 $28 = HEAP32[$27>>2]|0;
 $3 = $28;
 $29 = $1;
 $30 = ((($29)) + 64|0);
 $31 = HEAP32[$30>>2]|0;
 $4 = $31;
 $32 = $3;
 $33 = ($32|0)!=(0|0);
 if ($33) {
  $34 = $4;
  $35 = $3;
  $36 = ((($35)) + 64|0);
  HEAP32[$36>>2] = $34;
 }
 $37 = $4;
 $38 = ($37|0)!=(0|0);
 if ($38) {
  $39 = $3;
  $40 = $4;
  $41 = ((($40)) + 60|0);
  HEAP32[$41>>2] = $39;
 }
 $42 = $2;
 $43 = ((($42)) + 20|0);
 $44 = HEAP32[$43>>2]|0;
 $45 = $1;
 $46 = ($44|0)==($45|0);
 if ($46) {
  $47 = $4;
  $48 = $2;
  $49 = ((($48)) + 20|0);
  HEAP32[$49>>2] = $47;
 }
 $50 = $1;
 $51 = ((($50)) + 4|0);
 $52 = HEAP32[$51>>2]|0;
 $5 = $52;
 $53 = $5;
 $54 = ($53|0)==(0);
 do {
  if ($54) {
   $55 = $1;
   $56 = ((($55)) + 12|0);
   $6 = $56;
   $57 = $2;
   $58 = $6;
   _fus_arr_cleanup($57,$58);
  } else {
   $59 = $5;
   $60 = ($59|0)==(1);
   if ($60) {
    $61 = $1;
    $62 = ((($61)) + 12|0);
    $7 = $62;
    $63 = $2;
    $64 = $7;
    _fus_obj_cleanup($63,$64);
    break;
   }
   $65 = $5;
   $66 = ($65|0)==(2);
   if ($66) {
    $67 = $1;
    $68 = ((($67)) + 12|0);
    $8 = $68;
    $69 = $2;
    $70 = $8;
    _fus_str_cleanup($69,$70);
    break;
   }
   $71 = $5;
   $72 = ($71|0)==(3);
   if ($72) {
    $73 = $1;
    $74 = ((($73)) + 12|0);
    $9 = $74;
    $75 = $2;
    $76 = $9;
    _fus_fun_cleanup($75,$76);
    break;
   } else {
    $77 = HEAP32[54]|0;
    $78 = $5;
    HEAP32[$vararg_buffer1>>2] = 755;
    $vararg_ptr4 = ((($vararg_buffer1)) + 4|0);
    HEAP32[$vararg_ptr4>>2] = $78;
    (_fprintf($77,773,$vararg_buffer1)|0);
    break;
   }
  }
 } while(0);
 $79 = $1;
 $80 = HEAP32[$79>>2]|0;
 $81 = HEAP32[$80>>2]|0;
 $82 = $1;
 _fus_free($81,$82);
 STACKTOP = sp;return;
}
function _fus_boxed_attach($0) {
 $0 = $0|0;
 var $1 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $1 = $0;
 $2 = $1;
 $3 = ((($2)) + 8|0);
 $4 = HEAP32[$3>>2]|0;
 $5 = (($4) + 1)|0;
 HEAP32[$3>>2] = $5;
 STACKTOP = sp;return;
}
function _fus_boxed_detach($0) {
 $0 = $0|0;
 var $1 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, $vararg_buffer = 0, label = 0;
 var sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $vararg_buffer = sp;
 $1 = $0;
 $2 = $1;
 $3 = ((($2)) + 8|0);
 $4 = HEAP32[$3>>2]|0;
 $5 = (($4) + -1)|0;
 HEAP32[$3>>2] = $5;
 $6 = $1;
 $7 = ((($6)) + 8|0);
 $8 = HEAP32[$7>>2]|0;
 $9 = ($8|0)<=(0);
 if (!($9)) {
  STACKTOP = sp;return;
 }
 $10 = $1;
 $11 = ((($10)) + 8|0);
 $12 = HEAP32[$11>>2]|0;
 $13 = ($12|0)<(0);
 if ($13) {
  $14 = HEAP32[54]|0;
  HEAP32[$vararg_buffer>>2] = 859;
  (_fprintf($14,803,$vararg_buffer)|0);
  $15 = $1;
  $16 = HEAP32[54]|0;
  _fus_boxed_dump($15,$16);
  $17 = HEAP32[54]|0;
  (_fflush($17)|0);
 }
 $18 = $1;
 _fus_boxed_cleanup($18);
 STACKTOP = sp;return;
}
function _fus_class_init($0,$1,$2,$3,$4,$5,$6) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 $3 = $3|0;
 $4 = $4|0;
 $5 = $5|0;
 $6 = $6|0;
 var $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0, $29 = 0;
 var $30 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 32|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(32|0);
 $7 = $0;
 $8 = $1;
 $9 = $2;
 $10 = $3;
 $11 = $4;
 $12 = $5;
 $13 = $6;
 $14 = $8;
 $15 = $7;
 HEAP32[$15>>2] = $14;
 $16 = $9;
 $17 = $7;
 $18 = ((($17)) + 4|0);
 HEAP32[$18>>2] = $16;
 $19 = $10;
 $20 = $7;
 $21 = ((($20)) + 8|0);
 HEAP32[$21>>2] = $19;
 $22 = $11;
 $23 = $7;
 $24 = ((($23)) + 12|0);
 HEAP32[$24>>2] = $22;
 $25 = $12;
 $26 = $7;
 $27 = ((($26)) + 16|0);
 HEAP32[$27>>2] = $25;
 $28 = $13;
 $29 = $7;
 $30 = ((($29)) + 20|0);
 HEAP32[$30>>2] = $28;
 STACKTOP = sp;return;
}
function _fus_class_cleanup($0) {
 $0 = $0|0;
 var $1 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $1 = $0;
 STACKTOP = sp;return;
}
function _fus_class_instance_init($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $10 = 0, $11 = 0, $12 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $2 = $0;
 $3 = $1;
 $4 = $2;
 $5 = ((($4)) + 16|0);
 $6 = HEAP32[$5>>2]|0;
 $7 = ($6|0)!=(0|0);
 if (!($7)) {
  STACKTOP = sp;return;
 }
 $8 = $2;
 $9 = ((($8)) + 16|0);
 $10 = HEAP32[$9>>2]|0;
 $11 = $2;
 $12 = $3;
 FUNCTION_TABLE_vii[$10 & 31]($11,$12);
 STACKTOP = sp;return;
}
function _fus_class_instance_cleanup($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $10 = 0, $11 = 0, $12 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $2 = $0;
 $3 = $1;
 $4 = $2;
 $5 = ((($4)) + 20|0);
 $6 = HEAP32[$5>>2]|0;
 $7 = ($6|0)!=(0|0);
 if (!($7)) {
  STACKTOP = sp;return;
 }
 $8 = $2;
 $9 = ((($8)) + 20|0);
 $10 = HEAP32[$9>>2]|0;
 $11 = $2;
 $12 = $3;
 FUNCTION_TABLE_vii[$10 & 31]($11,$12);
 STACKTOP = sp;return;
}
function _fus_class_instance_init_zero($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $2 = $0;
 $3 = $1;
 $4 = $2;
 $5 = HEAP32[$4>>2]|0;
 $6 = $3;
 $7 = $2;
 $8 = ((($7)) + 8|0);
 $9 = HEAP32[$8>>2]|0;
 (_fus_memset($5,$6,0,$9)|0);
 STACKTOP = sp;return;
}
function _fus_class_instance_cleanup_zero($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $2 = $0;
 $3 = $1;
 $4 = $2;
 $5 = HEAP32[$4>>2]|0;
 $6 = $3;
 $7 = $2;
 $8 = ((($7)) + 8|0);
 $9 = HEAP32[$8>>2]|0;
 (_fus_memset($5,$6,0,$9)|0);
 STACKTOP = sp;return;
}
function _fus_class_init_zero($0,$1,$2,$3,$4) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 $3 = $3|0;
 $4 = $4|0;
 var $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 32|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(32|0);
 $5 = $0;
 $6 = $1;
 $7 = $2;
 $8 = $3;
 $9 = $4;
 $10 = $5;
 $11 = $6;
 $12 = $7;
 $13 = $8;
 $14 = $9;
 _fus_class_init($10,$11,$12,$13,$14,5,6);
 STACKTOP = sp;return;
}
function _fus_core_init($0) {
 $0 = $0|0;
 var $1 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $1 = $0;
 STACKTOP = sp;return;
}
function _fus_core_cleanup($0) {
 $0 = $0|0;
 var $1 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $1 = $0;
 STACKTOP = sp;return;
}
function _fus_perror($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $2 = 0, $3 = 0, $4 = 0, $5 = 0, $vararg_buffer = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $vararg_buffer = sp;
 $2 = $0;
 $3 = $1;
 $4 = HEAP32[54]|0;
 (_fprintf($4,876,$vararg_buffer)|0);
 $5 = $3;
 _perror($5);
 STACKTOP = sp;return;
}
function _fus_exit($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $vararg_buffer = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $vararg_buffer = sp;
 $2 = $0;
 $3 = $1;
 $4 = HEAP32[54]|0;
 $5 = $3;
 HEAP32[$vararg_buffer>>2] = $5;
 (_fprintf($4,889,$vararg_buffer)|0);
 $6 = $3;
 _exit(($6|0));
 // unreachable;
}
function _fus_malloc($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $10 = 0, $11 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $2 = $0;
 $3 = $1;
 $5 = $3;
 $6 = (_malloc($5)|0);
 $4 = $6;
 $7 = $4;
 $8 = ($7|0)==(0|0);
 if ($8) {
  $9 = $2;
  _fus_perror($9,910);
  $10 = $2;
  _fus_exit($10,1);
 }
 $11 = $4;
 STACKTOP = sp;return ($11|0);
}
function _fus_realloc($0,$1,$2) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 var $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $3 = $0;
 $4 = $1;
 $5 = $2;
 $7 = $4;
 $8 = $5;
 $9 = (_realloc($7,$8)|0);
 $6 = $9;
 $10 = $6;
 $11 = ($10|0)==(0|0);
 if (!($11)) {
  $14 = $6;
  STACKTOP = sp;return ($14|0);
 }
 $12 = $3;
 _fus_perror($12,921);
 $13 = $3;
 _fus_exit($13,1);
 $14 = $6;
 STACKTOP = sp;return ($14|0);
}
function _fus_free($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $2 = 0, $3 = 0, $4 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $2 = $0;
 $3 = $1;
 $4 = $3;
 _free($4);
 STACKTOP = sp;return;
}
function _fus_memset($0,$1,$2,$3) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 $3 = $3|0;
 var $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 32|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(32|0);
 $4 = $0;
 $5 = $1;
 $6 = $2;
 $7 = $3;
 $9 = $5;
 $10 = $6;
 $11 = $10&255;
 $12 = $7;
 _memset(($9|0),($11|0),($12|0))|0;
 $8 = $9;
 $13 = $8;
 $14 = ($13|0)==(0|0);
 if (!($14)) {
  $17 = $8;
  STACKTOP = sp;return ($17|0);
 }
 $15 = $4;
 _fus_perror($15,933);
 $16 = $4;
 _fus_exit($16,1);
 $17 = $8;
 STACKTOP = sp;return ($17|0);
}
function _fus_memcpy($0,$1,$2,$3) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 $3 = $3|0;
 var $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 32|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(32|0);
 $4 = $0;
 $5 = $1;
 $6 = $2;
 $7 = $3;
 $9 = $5;
 $10 = $6;
 $11 = $7;
 _memcpy(($9|0),($10|0),($11|0))|0;
 $8 = $9;
 $12 = $8;
 $13 = ($12|0)==(0|0);
 if (!($13)) {
  $16 = $8;
  STACKTOP = sp;return ($16|0);
 }
 $14 = $4;
 _fus_perror($14,944);
 $15 = $4;
 _fus_exit($15,1);
 $16 = $8;
 STACKTOP = sp;return ($16|0);
}
function _fus_memmove($0,$1,$2,$3) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 $3 = $3|0;
 var $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 32|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(32|0);
 $4 = $0;
 $5 = $1;
 $6 = $2;
 $7 = $3;
 $9 = $5;
 $10 = $6;
 $11 = $7;
 _memmove(($9|0),($10|0),($11|0))|0;
 $8 = $9;
 $12 = $8;
 $13 = ($12|0)==(0|0);
 if (!($13)) {
  $16 = $8;
  STACKTOP = sp;return ($16|0);
 }
 $14 = $4;
 _fus_perror($14,955);
 $15 = $4;
 _fus_exit($15,1);
 $16 = $8;
 STACKTOP = sp;return ($16|0);
}
function _fus_strnlen($0,$1,$2) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 var $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $3 = $0;
 $4 = $1;
 $5 = $2;
 $6 = 0;
 while(1) {
  $7 = $6;
  $8 = $5;
  $9 = ($7>>>0)<($8>>>0);
  if ($9) {
   $10 = $4;
   $11 = $6;
   $12 = (($10) + ($11)|0);
   $13 = HEAP8[$12>>0]|0;
   $14 = $13 << 24 >> 24;
   $15 = ($14|0)!=(0);
   $18 = $15;
  } else {
   $18 = 0;
  }
  $16 = $6;
  if (!($18)) {
   break;
  }
  $17 = (($16) + 1)|0;
  $6 = $17;
 }
 STACKTOP = sp;return ($16|0);
}
function _fus_strndup($0,$1,$2) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 var $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $20 = 0, $21 = 0, $22 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0;
 var label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 32|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(32|0);
 $3 = $0;
 $4 = $1;
 $5 = $2;
 $8 = $3;
 $9 = $4;
 $10 = $5;
 $11 = (_fus_strnlen($8,$9,$10)|0);
 $6 = $11;
 $12 = $3;
 $13 = $6;
 $14 = (($13) + 1)|0;
 $15 = (_fus_malloc($12,$14)|0);
 $7 = $15;
 $16 = $7;
 $17 = $4;
 $18 = $5;
 (_strncpy($16,$17,$18)|0);
 $19 = $7;
 $20 = $6;
 $21 = (($19) + ($20)|0);
 HEAP8[$21>>0] = 0;
 $22 = $7;
 STACKTOP = sp;return ($22|0);
}
function _fus_fun_cleanup($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $10 = 0, $11 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $2 = $0;
 $3 = $1;
 $4 = $3;
 $5 = HEAP32[$4>>2]|0;
 _free($5);
 $6 = $2;
 $7 = $3;
 $8 = ((($7)) + 4|0);
 _fus_arr_cleanup($6,$8);
 $9 = $2;
 $10 = $3;
 $11 = ((($10)) + 20|0);
 _fus_arr_cleanup($9,$11);
 STACKTOP = sp;return;
}
function _fus_init($0) {
 $0 = $0|0;
 var $1 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $1 = $0;
 $2 = $1;
 _fus_core_init($2);
 $3 = $1;
 $4 = ((($3)) + 4|0);
 _fus_lexer_init($4,0);
 $5 = $1;
 $6 = ((($5)) + 320|0);
 $7 = $1;
 _fus_symtable_init($6,$7);
 $8 = $1;
 $9 = ((($8)) + 364|0);
 $10 = $1;
 $11 = $1;
 $12 = ((($11)) + 320|0);
 _fus_vm_init($9,$10,$12);
 $13 = $1;
 $14 = ((($13)) + 532|0);
 $15 = $1;
 $16 = ((($15)) + 364|0);
 _fus_runner_init($14,$16);
 $17 = $1;
 $18 = ((($17)) + 764|0);
 _fus_printer_init($18);
 STACKTOP = sp;return;
}
function _fus_cleanup($0) {
 $0 = $0|0;
 var $1 = 0, $10 = 0, $11 = 0, $12 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $1 = $0;
 $2 = $1;
 $3 = ((($2)) + 764|0);
 _fus_printer_cleanup($3);
 $4 = $1;
 $5 = ((($4)) + 532|0);
 _fus_runner_cleanup($5);
 $6 = $1;
 $7 = ((($6)) + 364|0);
 _fus_vm_cleanup($7);
 $8 = $1;
 $9 = ((($8)) + 320|0);
 _fus_symtable_cleanup($9);
 $10 = $1;
 $11 = ((($10)) + 4|0);
 _fus_lexer_cleanup($11);
 $12 = $1;
 _fus_core_cleanup($12);
 STACKTOP = sp;return;
}
function _fus_value_int_add($0,$1,$2,$3) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 $3 = $3|0;
 var $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0, $29 = 0;
 var $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $4 = $1;
 $8 = HEAP32[$2>>2]|0;
 $9 = $8 & 3;
 $10 = ($9|0)==(1);
 if (!($10)) {
  $11 = $4;
  _fus_value_err($0,$11,0);
  STACKTOP = sp;return;
 }
 $12 = HEAP32[$3>>2]|0;
 $13 = $12 & 3;
 $14 = ($13|0)==(1);
 if (!($14)) {
  $15 = $4;
  _fus_value_err($0,$15,0);
  STACKTOP = sp;return;
 }
 $16 = HEAP32[$2>>2]|0;
 $17 = $16 >> 2;
 $5 = $17;
 $18 = HEAP32[$3>>2]|0;
 $19 = $18 >> 2;
 $6 = $19;
 $20 = $5;
 $21 = ($20|0)>(0);
 if ($21) {
  $22 = $6;
  $23 = $5;
  $24 = (536870911 - ($23))|0;
  $25 = ($22|0)>($24|0);
  if ($25) {
   $26 = $4;
   _fus_value_err($0,$26,1);
   STACKTOP = sp;return;
  }
 }
 $27 = $5;
 $28 = ($27|0)<(0);
 if ($28) {
  $29 = $6;
  $30 = $5;
  $31 = (-536870912 - ($30))|0;
  $32 = ($29|0)<($31|0);
  if ($32) {
   $33 = $4;
   _fus_value_err($0,$33,2);
   STACKTOP = sp;return;
  }
 }
 $34 = $5;
 $35 = $6;
 $36 = (($34) + ($35))|0;
 $7 = $36;
 $37 = $4;
 $38 = $7;
 _fus_value_int($0,$37,$38);
 STACKTOP = sp;return;
}
function _fus_value_int_sub($0,$1,$2,$3) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 $3 = $3|0;
 var $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0, $29 = 0;
 var $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $4 = $1;
 $8 = HEAP32[$2>>2]|0;
 $9 = $8 & 3;
 $10 = ($9|0)==(1);
 if (!($10)) {
  $11 = $4;
  _fus_value_err($0,$11,0);
  STACKTOP = sp;return;
 }
 $12 = HEAP32[$3>>2]|0;
 $13 = $12 & 3;
 $14 = ($13|0)==(1);
 if (!($14)) {
  $15 = $4;
  _fus_value_err($0,$15,0);
  STACKTOP = sp;return;
 }
 $16 = HEAP32[$2>>2]|0;
 $17 = $16 >> 2;
 $5 = $17;
 $18 = HEAP32[$3>>2]|0;
 $19 = $18 >> 2;
 $6 = $19;
 $20 = $5;
 $21 = ($20|0)<(0);
 if ($21) {
  $22 = $6;
  $23 = $5;
  $24 = (536870911 + ($23))|0;
  $25 = ($22|0)>($24|0);
  if ($25) {
   $26 = $4;
   _fus_value_err($0,$26,1);
   STACKTOP = sp;return;
  }
 }
 $27 = $5;
 $28 = ($27|0)>(0);
 if ($28) {
  $29 = $6;
  $30 = $5;
  $31 = (-536870912 + ($30))|0;
  $32 = ($29|0)<($31|0);
  if ($32) {
   $33 = $4;
   _fus_value_err($0,$33,2);
   STACKTOP = sp;return;
  }
 }
 $34 = $5;
 $35 = $6;
 $36 = (($34) - ($35))|0;
 $7 = $36;
 $37 = $4;
 $38 = $7;
 _fus_value_int($0,$37,$38);
 STACKTOP = sp;return;
}
function _fus_value_int_mul($0,$1,$2,$3) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 $3 = $3|0;
 var $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0, $29 = 0;
 var $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $4 = 0, $40 = 0, $41 = 0, $42 = 0, $43 = 0, $44 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0;
 var $9 = 0, $or$cond = 0, $or$cond3 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $4 = $1;
 $8 = HEAP32[$2>>2]|0;
 $9 = $8 & 3;
 $10 = ($9|0)==(1);
 if (!($10)) {
  $11 = $4;
  _fus_value_err($0,$11,0);
  STACKTOP = sp;return;
 }
 $12 = HEAP32[$3>>2]|0;
 $13 = $12 & 3;
 $14 = ($13|0)==(1);
 if (!($14)) {
  $15 = $4;
  _fus_value_err($0,$15,0);
  STACKTOP = sp;return;
 }
 $16 = HEAP32[$2>>2]|0;
 $17 = $16 >> 2;
 $5 = $17;
 $18 = HEAP32[$3>>2]|0;
 $19 = $18 >> 2;
 $6 = $19;
 $20 = $6;
 $21 = $5;
 $22 = (536870911 / ($21|0))&-1;
 $23 = ($20|0)>($22|0);
 if ($23) {
  $24 = $4;
  _fus_value_err($0,$24,1);
  STACKTOP = sp;return;
 }
 $25 = $6;
 $26 = $5;
 $27 = (-536870912 / ($26|0))&-1;
 $28 = ($25|0)<($27|0);
 if ($28) {
  $29 = $4;
  _fus_value_err($0,$29,2);
  STACKTOP = sp;return;
 }
 $30 = $5;
 $31 = ($30|0)==(-1);
 $32 = $6;
 $33 = ($32|0)==(-536870912);
 $or$cond = $31 & $33;
 if ($or$cond) {
  $34 = $4;
  _fus_value_err($0,$34,1);
  STACKTOP = sp;return;
 }
 $35 = $6;
 $36 = ($35|0)==(-1);
 $37 = $5;
 $38 = ($37|0)==(-536870912);
 $or$cond3 = $36 & $38;
 if ($or$cond3) {
  $39 = $4;
  _fus_value_err($0,$39,1);
  STACKTOP = sp;return;
 } else {
  $40 = $5;
  $41 = $6;
  $42 = Math_imul($40, $41)|0;
  $7 = $42;
  $43 = $4;
  $44 = $7;
  _fus_value_int($0,$43,$44);
  STACKTOP = sp;return;
 }
}
function _fus_lexer_token_type_msg($0) {
 $0 = $0|0;
 var $1 = 0, $10 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, $or$cond = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $2 = $0;
 $3 = $2;
 $4 = ($3>>>0)<(0);
 $5 = $2;
 $6 = ($5>>>0)>=(8);
 $or$cond = $4 | $6;
 if ($or$cond) {
  $1 = 2101;
  $10 = $1;
  STACKTOP = sp;return ($10|0);
 } else {
  $7 = $2;
  $8 = (24 + ($7<<2)|0);
  $9 = HEAP32[$8>>2]|0;
  $1 = $9;
  $10 = $1;
  STACKTOP = sp;return ($10|0);
 }
 return (0)|0;
}
function _fus_lexer_init($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0;
 var $29 = 0, $3 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $4 = 0, $40 = 0, $41 = 0, $42 = 0, $43 = 0, $44 = 0, $5 = 0, $6 = 0;
 var $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $2 = $0;
 $3 = $1;
 $5 = $2;
 HEAP32[$5>>2] = 0;
 $6 = $2;
 $7 = ((($6)) + 4|0);
 HEAP32[$7>>2] = 0;
 $8 = $2;
 $9 = ((($8)) + 8|0);
 HEAP32[$9>>2] = 0;
 $10 = $2;
 $11 = ((($10)) + 12|0);
 HEAP8[$11>>0] = 0;
 $12 = $3;
 $13 = ($12|0)!=(0|0);
 $14 = $3;
 $15 = $13 ? $14 : 967;
 $16 = $2;
 $17 = ((($16)) + 16|0);
 HEAP32[$17>>2] = $15;
 $18 = $2;
 $19 = ((($18)) + 20|0);
 HEAP32[$19>>2] = 0;
 $20 = $2;
 $21 = ((($20)) + 24|0);
 HEAP32[$21>>2] = 0;
 $22 = $2;
 $23 = ((($22)) + 28|0);
 HEAP32[$23>>2] = 0;
 $24 = $2;
 $25 = ((($24)) + 32|0);
 HEAP32[$25>>2] = 0;
 $4 = 0;
 while(1) {
  $26 = $4;
  $27 = ($26|0)<(64);
  $28 = $2;
  if (!($27)) {
   break;
  }
  $29 = ((($28)) + 36|0);
  $30 = $4;
  $31 = (($29) + ($30<<2)|0);
  HEAP32[$31>>2] = 0;
  $32 = $4;
  $33 = (($32) + 1)|0;
  $4 = $33;
 }
 $34 = ((($28)) + 292|0);
 HEAP32[$34>>2] = 0;
 $35 = $2;
 $36 = ((($35)) + 296|0);
 HEAP32[$36>>2] = 0;
 $37 = $2;
 $38 = ((($37)) + 300|0);
 HEAP32[$38>>2] = 0;
 $39 = $2;
 $40 = ((($39)) + 304|0);
 HEAP32[$40>>2] = 0;
 $41 = $2;
 $42 = ((($41)) + 308|0);
 HEAP32[$42>>2] = 1;
 $43 = $2;
 $44 = ((($43)) + 312|0);
 HEAP32[$44>>2] = 0;
 STACKTOP = sp;return;
}
function _fus_lexer_cleanup($0) {
 $0 = $0|0;
 var $1 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $1 = $0;
 $2 = $1;
 $3 = ((($2)) + 16|0);
 $4 = HEAP32[$3>>2]|0;
 $5 = ($4|0)!=(967|0);
 if (!($5)) {
  STACKTOP = sp;return;
 }
 $6 = $1;
 $7 = ((($6)) + 16|0);
 $8 = HEAP32[$7>>2]|0;
 _free($8);
 STACKTOP = sp;return;
}
function _fus_lexer_set_error($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $2 = $0;
 $3 = $1;
 $4 = $2;
 $5 = ((($4)) + 308|0);
 HEAP32[$5>>2] = 1;
 $6 = $3;
 $7 = $2;
 $8 = ((($7)) + 312|0);
 HEAP32[$8>>2] = $6;
 STACKTOP = sp;return;
}
function _fus_lexer_load_chunk($0,$1,$2) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 var $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0;
 var $7 = 0, $8 = 0, $9 = 0, $vararg_buffer = 0, $vararg_buffer1 = 0, $vararg_ptr4 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 32|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(32|0);
 $vararg_buffer1 = sp + 8|0;
 $vararg_buffer = sp;
 $3 = $0;
 $4 = $1;
 $5 = $2;
 $6 = $3;
 $7 = ((($6)) + 308|0);
 $8 = HEAP32[$7>>2]|0;
 $9 = ($8|0)==(7);
 if ($9) {
  $10 = HEAP32[54]|0;
  HEAP32[$vararg_buffer>>2] = 1046;
  (_fprintf($10,1013,$vararg_buffer)|0);
  $11 = HEAP32[54]|0;
  $12 = $3;
  $13 = ((($12)) + 304|0);
  $14 = HEAP32[$13>>2]|0;
  $15 = $3;
  $16 = ((($15)) + 300|0);
  $17 = HEAP32[$16>>2]|0;
  HEAP32[$vararg_buffer1>>2] = $14;
  $vararg_ptr4 = ((($vararg_buffer1)) + 4|0);
  HEAP32[$vararg_ptr4>>2] = $17;
  (_fprintf($11,1403,$vararg_buffer1)|0);
  _exit(1);
  // unreachable;
 } else {
  $18 = $4;
  $19 = $3;
  HEAP32[$19>>2] = $18;
  $20 = $5;
  $21 = $3;
  $22 = ((($21)) + 4|0);
  HEAP32[$22>>2] = $20;
  $23 = $3;
  $24 = ((($23)) + 8|0);
  HEAP32[$24>>2] = 0;
  $25 = $3;
  _fus_lexer_next($25);
  STACKTOP = sp;return;
 }
}
function _fus_lexer_next($0) {
 $0 = $0|0;
 var $$sink = 0, $$sink2 = 0, $$sink3 = 0, $$sink4$sink$sink$sink$sink$sink = 0, $$sink6$sink$sink$sink$sink$sink = 0, $1 = 0, $10 = 0, $100 = 0, $101 = 0, $102 = 0, $103 = 0, $104 = 0, $105 = 0, $106 = 0, $107 = 0, $108 = 0, $109 = 0, $11 = 0, $110 = 0, $111 = 0;
 var $112 = 0, $113 = 0, $114 = 0, $115 = 0, $116 = 0, $117 = 0, $118 = 0, $119 = 0, $12 = 0, $120 = 0, $121 = 0, $122 = 0, $123 = 0, $124 = 0, $125 = 0, $126 = 0, $127 = 0, $128 = 0, $129 = 0, $13 = 0;
 var $130 = 0, $131 = 0, $132 = 0, $133 = 0, $134 = 0, $135 = 0, $136 = 0, $137 = 0, $138 = 0, $139 = 0, $14 = 0, $140 = 0, $141 = 0, $142 = 0, $143 = 0, $144 = 0, $145 = 0, $146 = 0, $147 = 0, $148 = 0;
 var $149 = 0, $15 = 0, $150 = 0, $151 = 0, $152 = 0, $153 = 0, $154 = 0, $155 = 0, $156 = 0, $157 = 0, $158 = 0, $159 = 0, $16 = 0, $160 = 0, $161 = 0, $162 = 0, $163 = 0, $164 = 0, $165 = 0, $166 = 0;
 var $167 = 0, $168 = 0, $169 = 0, $17 = 0, $170 = 0, $171 = 0, $172 = 0, $173 = 0, $174 = 0, $175 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0;
 var $27 = 0, $28 = 0, $29 = 0, $3 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $4 = 0, $40 = 0, $41 = 0, $42 = 0, $43 = 0, $44 = 0;
 var $45 = 0, $46 = 0, $47 = 0, $48 = 0, $49 = 0, $5 = 0, $50 = 0, $51 = 0, $52 = 0, $53 = 0, $54 = 0, $55 = 0, $56 = 0, $57 = 0, $58 = 0, $59 = 0, $6 = 0, $60 = 0, $61 = 0, $62 = 0;
 var $63 = 0, $64 = 0, $65 = 0, $66 = 0, $67 = 0, $68 = 0, $69 = 0, $7 = 0, $70 = 0, $71 = 0, $72 = 0, $73 = 0, $74 = 0, $75 = 0, $76 = 0, $77 = 0, $78 = 0, $79 = 0, $8 = 0, $80 = 0;
 var $81 = 0, $82 = 0, $83 = 0, $84 = 0, $85 = 0, $86 = 0, $87 = 0, $88 = 0, $89 = 0, $9 = 0, $90 = 0, $91 = 0, $92 = 0, $93 = 0, $94 = 0, $95 = 0, $96 = 0, $97 = 0, $98 = 0, $99 = 0;
 var label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $1 = $0;
 $2 = 0;
 while(1) {
  $3 = $1;
  $4 = ((($3)) + 296|0);
  $5 = HEAP32[$4>>2]|0;
  $6 = ($5|0)!=(0);
  if ($6) {
   label = 16;
   break;
  }
  $7 = $1;
  $8 = ((($7)) + 8|0);
  $9 = HEAP32[$8>>2]|0;
  $10 = $1;
  $11 = ((($10)) + 4|0);
  $12 = HEAP32[$11>>2]|0;
  $13 = ($9>>>0)>=($12>>>0);
  if ($13) {
   label = 16;
   break;
  }
  $14 = $1;
  $15 = HEAP32[$14>>2]|0;
  $16 = $1;
  $17 = ((($16)) + 8|0);
  $18 = HEAP32[$17>>2]|0;
  $19 = (($15) + ($18)|0);
  $20 = HEAP8[$19>>0]|0;
  $2 = $20;
  $21 = $2;
  $22 = $21 << 24 >> 24;
  $23 = ($22|0)==(10);
  if (!($23)) {
   $24 = $2;
   $25 = $24 << 24 >> 24;
   $26 = ($25|0)==(0);
   if (!($26)) {
    $37 = $2;
    $38 = $37 << 24 >> 24;
    $39 = (_isspace($38)|0);
    $40 = ($39|0)!=(0);
    if ($40) {
     $41 = $1;
     _fus_lexer_eat_whitespace($41);
     continue;
    }
    $42 = $2;
    $43 = $42 << 24 >> 24;
    $44 = ($43|0)==(35);
    if ($44) {
     $45 = $1;
     _fus_lexer_eat_comment($45);
     continue;
    }
    $46 = $2;
    $47 = $46 << 24 >> 24;
    $48 = ($47|0)==(58);
    if (!($48)) {
     label = 16;
     break;
    }
    $49 = $1;
    (_fus_lexer_eat($49)|0);
    $50 = $1;
    $51 = ((($50)) + 296|0);
    $52 = HEAP32[$51>>2]|0;
    $53 = (($52) + 1)|0;
    HEAP32[$51>>2] = $53;
    $54 = $1;
    $55 = $1;
    $56 = ((($55)) + 32|0);
    $57 = HEAP32[$56>>2]|0;
    $58 = (_fus_lexer_push_indent($54,$57)|0);
    $59 = ($58|0)<(0);
    if ($59) {
     label = 46;
     break;
    } else {
     continue;
    }
   }
  }
  $27 = $2;
  $28 = $27 << 24 >> 24;
  $29 = ($28|0)==(10);
  if ($29) {
   $30 = $1;
   (_fus_lexer_eat($30)|0);
  }
  $31 = $1;
  $32 = (_fus_lexer_finish_line($31)|0);
  $33 = ($32|0)<(0);
  if ($33) {
   label = 46;
   break;
  }
  $34 = $2;
  $35 = $34 << 24 >> 24;
  $36 = ($35|0)==(0);
  if ($36) {
   label = 16;
   break;
  }
 }
 if ((label|0) == 16) {
  $60 = $1;
  $61 = ((($60)) + 296|0);
  $62 = HEAP32[$61>>2]|0;
  $63 = ($62|0)!=(0);
  $64 = $1;
  if ($63) {
   $65 = ((($64)) + 296|0);
   $66 = HEAP32[$65>>2]|0;
   $67 = ($66|0)>(0);
   $68 = $1;
   $69 = ((($68)) + 296|0);
   $70 = HEAP32[$69>>2]|0;
   if ($67) {
    $71 = (($70) + -1)|0;
    HEAP32[$69>>2] = $71;
    $72 = $1;
    $73 = ((($72)) + 300|0);
    HEAP32[$73>>2] = 4971;
    $74 = $1;
    $75 = ((($74)) + 304|0);
    HEAP32[$75>>2] = 1;
    $76 = $1;
    $$sink = 5;$$sink2 = $76;
   } else {
    $77 = (($70) + 1)|0;
    HEAP32[$69>>2] = $77;
    $78 = $1;
    $79 = ((($78)) + 300|0);
    HEAP32[$79>>2] = 5473;
    $80 = $1;
    $81 = ((($80)) + 304|0);
    HEAP32[$81>>2] = 1;
    $82 = $1;
    $$sink = 6;$$sink2 = $82;
   }
   $83 = ((($$sink2)) + 308|0);
   HEAP32[$83>>2] = $$sink;
   STACKTOP = sp;return;
  }
  $84 = ((($64)) + 8|0);
  $85 = HEAP32[$84>>2]|0;
  $86 = $1;
  $87 = ((($86)) + 4|0);
  $88 = HEAP32[$87>>2]|0;
  $89 = ($85>>>0)>=($88>>>0);
  if ($89) {
   $90 = $1;
   $91 = ((($90)) + 12|0);
   $92 = HEAP8[$91>>0]|0;
   $93 = $92&1;
   $94 = $1;
   $95 = ((($94)) + 300|0);
   HEAP32[$95>>2] = 0;
   $96 = $1;
   $97 = ((($96)) + 304|0);
   HEAP32[$97>>2] = 0;
   $98 = $1;
   $99 = ((($98)) + 308|0);
   $$sink3 = $93 ? 0 : 7;
   HEAP32[$99>>2] = $$sink3;
  } else {
   $100 = $2;
   $101 = $100 << 24 >> 24;
   $102 = ($101|0)==(40);
   L33: do {
    if ($102) {
     label = 25;
    } else {
     $103 = $2;
     $104 = $103 << 24 >> 24;
     $105 = ($104|0)==(41);
     if ($105) {
      label = 25;
     } else {
      $114 = $2;
      $115 = $114 << 24 >> 24;
      $116 = ($115|0)==(95);
      if (!($116)) {
       $117 = $2;
       $118 = $117 << 24 >> 24;
       $119 = (_isalpha($118)|0);
       $120 = ($119|0)!=(0);
       if (!($120)) {
        $123 = $2;
        $124 = $123 << 24 >> 24;
        $125 = (_isdigit($124)|0);
        $126 = ($125|0)!=(0);
        do {
         if (!($126)) {
          $127 = $2;
          $128 = $127 << 24 >> 24;
          $129 = ($128|0)==(45);
          if ($129) {
           $130 = $1;
           $131 = (_fus_lexer_peek($130)|0);
           $132 = $131 << 24 >> 24;
           $133 = (_isdigit($132)|0);
           $134 = ($133|0)!=(0);
           if ($134) {
            break;
           }
          }
          $137 = $2;
          $138 = $137 << 24 >> 24;
          $139 = ($138|0)==(34);
          if ($139) {
           $140 = $1;
           $141 = (_fus_lexer_parse_str($140)|0);
           $142 = ($141|0)<(0);
           if ($142) {
            STACKTOP = sp;return;
           } else {
            $143 = $1;
            $$sink4$sink$sink$sink$sink$sink = 4;$$sink6$sink$sink$sink$sink$sink = $143;
            break L33;
           }
          }
          $144 = $2;
          $145 = $144 << 24 >> 24;
          $146 = ($145|0)==(59);
          if ($146) {
           $147 = $1;
           $148 = (_fus_lexer_peek($147)|0);
           $149 = $148 << 24 >> 24;
           $150 = ($149|0)==(59);
           if ($150) {
            $151 = $1;
            _fus_lexer_parse_blockstr($151);
            $152 = $1;
            $$sink4$sink$sink$sink$sink$sink = 4;$$sink6$sink$sink$sink$sink$sink = $152;
            break L33;
           }
          }
          $153 = $2;
          $154 = $153 << 24 >> 24;
          $155 = ($154|0)==(0);
          $156 = $1;
          if ($155) {
           $157 = ((($156)) + 300|0);
           HEAP32[$157>>2] = 0;
           $158 = $1;
           $159 = ((($158)) + 304|0);
           HEAP32[$159>>2] = 0;
           $160 = $1;
           $$sink4$sink$sink$sink$sink$sink = 0;$$sink6$sink$sink$sink$sink$sink = $160;
           break L33;
          } else {
           _fus_lexer_parse_op($156);
           $161 = $1;
           $$sink4$sink$sink$sink$sink$sink = 3;$$sink6$sink$sink$sink$sink$sink = $161;
           break L33;
          }
         }
        } while(0);
        $135 = $1;
        _fus_lexer_parse_int($135);
        $136 = $1;
        $$sink4$sink$sink$sink$sink$sink = 2;$$sink6$sink$sink$sink$sink$sink = $136;
        break;
       }
      }
      $121 = $1;
      _fus_lexer_parse_sym($121);
      $122 = $1;
      $$sink4$sink$sink$sink$sink$sink = 3;$$sink6$sink$sink$sink$sink$sink = $122;
     }
    }
   } while(0);
   if ((label|0) == 25) {
    $106 = $1;
    _fus_lexer_start_token($106);
    $107 = $1;
    (_fus_lexer_eat($107)|0);
    $108 = $1;
    _fus_lexer_end_token($108);
    $109 = $2;
    $110 = $109 << 24 >> 24;
    $111 = ($110|0)==(40);
    $112 = $111 ? 5 : 6;
    $113 = $1;
    $$sink4$sink$sink$sink$sink$sink = $112;$$sink6$sink$sink$sink$sink$sink = $113;
   }
   $162 = ((($$sink6$sink$sink$sink$sink$sink)) + 308|0);
   HEAP32[$162>>2] = $$sink4$sink$sink$sink$sink$sink;
  }
  $163 = $1;
  $164 = ((($163)) + 8|0);
  $165 = HEAP32[$164>>2]|0;
  $166 = $1;
  $167 = ((($166)) + 4|0);
  $168 = HEAP32[$167>>2]|0;
  $169 = ($165>>>0)>=($168>>>0);
  if (!($169)) {
   STACKTOP = sp;return;
  }
  $170 = $1;
  $171 = ((($170)) + 12|0);
  $172 = HEAP8[$171>>0]|0;
  $173 = $172&1;
  if ($173) {
   STACKTOP = sp;return;
  }
  $174 = $1;
  $175 = ((($174)) + 308|0);
  HEAP32[$175>>2] = 7;
  STACKTOP = sp;return;
 }
 else if ((label|0) == 46) {
  STACKTOP = sp;return;
 }
}
function _fus_lexer_eat($0) {
 $0 = $0|0;
 var $1 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0;
 var $28 = 0, $29 = 0, $3 = 0, $30 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $1 = $0;
 $3 = $1;
 $4 = HEAP32[$3>>2]|0;
 $5 = $1;
 $6 = ((($5)) + 8|0);
 $7 = HEAP32[$6>>2]|0;
 $8 = (($4) + ($7)|0);
 $9 = HEAP8[$8>>0]|0;
 $2 = $9;
 $10 = $1;
 $11 = ((($10)) + 8|0);
 $12 = HEAP32[$11>>2]|0;
 $13 = (($12) + 1)|0;
 HEAP32[$11>>2] = $13;
 $14 = $1;
 $15 = ((($14)) + 20|0);
 $16 = HEAP32[$15>>2]|0;
 $17 = (($16) + 1)|0;
 HEAP32[$15>>2] = $17;
 $18 = $2;
 $19 = $18 << 24 >> 24;
 $20 = ($19|0)==(10);
 $21 = $1;
 if ($20) {
  $22 = ((($21)) + 24|0);
  $23 = HEAP32[$22>>2]|0;
  $24 = (($23) + 1)|0;
  HEAP32[$22>>2] = $24;
  $25 = $1;
  $26 = ((($25)) + 28|0);
  HEAP32[$26>>2] = 0;
  $30 = $2;
  STACKTOP = sp;return ($30|0);
 } else {
  $27 = ((($21)) + 28|0);
  $28 = HEAP32[$27>>2]|0;
  $29 = (($28) + 1)|0;
  HEAP32[$27>>2] = $29;
  $30 = $2;
  STACKTOP = sp;return ($30|0);
 }
 return (0)|0;
}
function _fus_lexer_finish_line($0) {
 $0 = $0|0;
 var $1 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0;
 var $28 = 0, $29 = 0, $3 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $2 = $0;
 $5 = $2;
 $6 = (_fus_lexer_eat_indent($5)|0);
 $7 = ($6|0)<(0);
 if ($7) {
  $1 = -1;
  $33 = $1;
  STACKTOP = sp;return ($33|0);
 }
 $8 = $2;
 $9 = ((($8)) + 32|0);
 $10 = HEAP32[$9>>2]|0;
 $3 = $10;
 while(1) {
  $11 = $2;
  $12 = ((($11)) + 292|0);
  $13 = HEAP32[$12>>2]|0;
  $14 = ($13|0)>(0);
  if (!($14)) {
   label = 9;
   break;
  }
  $15 = $2;
  $16 = ((($15)) + 36|0);
  $17 = $2;
  $18 = ((($17)) + 292|0);
  $19 = HEAP32[$18>>2]|0;
  $20 = (($19) - 1)|0;
  $21 = (($16) + ($20<<2)|0);
  $22 = HEAP32[$21>>2]|0;
  $4 = $22;
  $23 = $3;
  $24 = $4;
  $25 = ($23|0)<=($24|0);
  if (!($25)) {
   label = 9;
   break;
  }
  $26 = $2;
  $27 = (_fus_lexer_pop_indent($26)|0);
  $28 = ($27|0)<(0);
  if ($28) {
   label = 7;
   break;
  }
  $29 = $2;
  $30 = ((($29)) + 296|0);
  $31 = HEAP32[$30>>2]|0;
  $32 = (($31) + -1)|0;
  HEAP32[$30>>2] = $32;
 }
 if ((label|0) == 7) {
  $1 = -1;
  $33 = $1;
  STACKTOP = sp;return ($33|0);
 }
 else if ((label|0) == 9) {
  $1 = 0;
  $33 = $1;
  STACKTOP = sp;return ($33|0);
 }
 return (0)|0;
}
function _fus_lexer_eat_whitespace($0) {
 $0 = $0|0;
 var $1 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $3 = 0, $4 = 0, $5 = 0;
 var $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $1 = $0;
 while(1) {
  $3 = $1;
  $4 = ((($3)) + 8|0);
  $5 = HEAP32[$4>>2]|0;
  $6 = $1;
  $7 = ((($6)) + 4|0);
  $8 = HEAP32[$7>>2]|0;
  $9 = ($5>>>0)<($8>>>0);
  if (!($9)) {
   label = 6;
   break;
  }
  $10 = $1;
  $11 = HEAP32[$10>>2]|0;
  $12 = $1;
  $13 = ((($12)) + 8|0);
  $14 = HEAP32[$13>>2]|0;
  $15 = (($11) + ($14)|0);
  $16 = HEAP8[$15>>0]|0;
  $2 = $16;
  $17 = $2;
  $18 = $17 << 24 >> 24;
  $19 = ($18|0)==(0);
  if ($19) {
   label = 6;
   break;
  }
  $20 = $2;
  $21 = $20 << 24 >> 24;
  $22 = (_isgraph($21)|0);
  $23 = ($22|0)!=(0);
  if ($23) {
   label = 6;
   break;
  }
  $24 = $1;
  (_fus_lexer_eat($24)|0);
 }
 if ((label|0) == 6) {
  STACKTOP = sp;return;
 }
}
function _fus_lexer_eat_comment($0) {
 $0 = $0|0;
 var $1 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0;
 var $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $1 = $0;
 $3 = $1;
 (_fus_lexer_eat($3)|0);
 while(1) {
  $4 = $1;
  $5 = ((($4)) + 8|0);
  $6 = HEAP32[$5>>2]|0;
  $7 = $1;
  $8 = ((($7)) + 4|0);
  $9 = HEAP32[$8>>2]|0;
  $10 = ($6>>>0)<($9>>>0);
  if (!($10)) {
   label = 5;
   break;
  }
  $11 = $1;
  $12 = HEAP32[$11>>2]|0;
  $13 = $1;
  $14 = ((($13)) + 8|0);
  $15 = HEAP32[$14>>2]|0;
  $16 = (($12) + ($15)|0);
  $17 = HEAP8[$16>>0]|0;
  $2 = $17;
  $18 = $2;
  $19 = $18 << 24 >> 24;
  $20 = ($19|0)==(10);
  if ($20) {
   label = 5;
   break;
  }
  $21 = $1;
  (_fus_lexer_eat($21)|0);
 }
 if ((label|0) == 5) {
  STACKTOP = sp;return;
 }
}
function _fus_lexer_push_indent($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0;
 var $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $3 = $0;
 $4 = $1;
 $5 = $4;
 $6 = ($5|0)<(0);
 $7 = $3;
 if ($6) {
  _fus_lexer_set_error($7,5);
  $2 = -1;
  $23 = $2;
  STACKTOP = sp;return ($23|0);
 }
 $8 = ((($7)) + 292|0);
 $9 = HEAP32[$8>>2]|0;
 $10 = ($9|0)>=(64);
 if ($10) {
  $11 = $3;
  _fus_lexer_set_error($11,3);
  $2 = -1;
  $23 = $2;
  STACKTOP = sp;return ($23|0);
 } else {
  $12 = $4;
  $13 = $3;
  $14 = ((($13)) + 36|0);
  $15 = $3;
  $16 = ((($15)) + 292|0);
  $17 = HEAP32[$16>>2]|0;
  $18 = (($14) + ($17<<2)|0);
  HEAP32[$18>>2] = $12;
  $19 = $3;
  $20 = ((($19)) + 292|0);
  $21 = HEAP32[$20>>2]|0;
  $22 = (($21) + 1)|0;
  HEAP32[$20>>2] = $22;
  $2 = 0;
  $23 = $2;
  STACKTOP = sp;return ($23|0);
 }
 return (0)|0;
}
function _fus_lexer_start_token($0) {
 $0 = $0|0;
 var $1 = 0, $10 = 0, $11 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $1 = $0;
 $2 = $1;
 $3 = HEAP32[$2>>2]|0;
 $4 = $1;
 $5 = ((($4)) + 8|0);
 $6 = HEAP32[$5>>2]|0;
 $7 = (($3) + ($6)|0);
 $8 = $1;
 $9 = ((($8)) + 300|0);
 HEAP32[$9>>2] = $7;
 $10 = $1;
 $11 = ((($10)) + 304|0);
 HEAP32[$11>>2] = 0;
 STACKTOP = sp;return;
}
function _fus_lexer_end_token($0) {
 $0 = $0|0;
 var $1 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $1 = $0;
 $3 = $1;
 $4 = ((($3)) + 300|0);
 $5 = HEAP32[$4>>2]|0;
 $6 = $1;
 $7 = HEAP32[$6>>2]|0;
 $8 = $5;
 $9 = $7;
 $10 = (($8) - ($9))|0;
 $2 = $10;
 $11 = $1;
 $12 = ((($11)) + 8|0);
 $13 = HEAP32[$12>>2]|0;
 $14 = $2;
 $15 = (($13) - ($14))|0;
 $16 = $1;
 $17 = ((($16)) + 304|0);
 HEAP32[$17>>2] = $15;
 STACKTOP = sp;return;
}
function _fus_lexer_parse_sym($0) {
 $0 = $0|0;
 var $1 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $3 = 0;
 var $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $1 = $0;
 $3 = $1;
 _fus_lexer_start_token($3);
 while(1) {
  $4 = $1;
  $5 = ((($4)) + 8|0);
  $6 = HEAP32[$5>>2]|0;
  $7 = $1;
  $8 = ((($7)) + 4|0);
  $9 = HEAP32[$8>>2]|0;
  $10 = ($6>>>0)<($9>>>0);
  if (!($10)) {
   label = 6;
   break;
  }
  $11 = $1;
  $12 = HEAP32[$11>>2]|0;
  $13 = $1;
  $14 = ((($13)) + 8|0);
  $15 = HEAP32[$14>>2]|0;
  $16 = (($12) + ($15)|0);
  $17 = HEAP8[$16>>0]|0;
  $2 = $17;
  $18 = $2;
  $19 = $18 << 24 >> 24;
  $20 = ($19|0)!=(95);
  if ($20) {
   $21 = $2;
   $22 = $21 << 24 >> 24;
   $23 = (_isalnum($22)|0);
   $24 = ($23|0)!=(0);
   if (!($24)) {
    label = 6;
    break;
   }
  }
  $25 = $1;
  (_fus_lexer_eat($25)|0);
 }
 if ((label|0) == 6) {
  $26 = $1;
  _fus_lexer_end_token($26);
  STACKTOP = sp;return;
 }
}
function _fus_lexer_peek($0) {
 $0 = $0|0;
 var $1 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0;
 var sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $2 = $0;
 $3 = $2;
 $4 = ((($3)) + 8|0);
 $5 = HEAP32[$4>>2]|0;
 $6 = (($5) + 1)|0;
 $7 = $2;
 $8 = ((($7)) + 4|0);
 $9 = HEAP32[$8>>2]|0;
 $10 = ($6>>>0)>=($9>>>0);
 if ($10) {
  $1 = 0;
  $19 = $1;
  STACKTOP = sp;return ($19|0);
 } else {
  $11 = $2;
  $12 = HEAP32[$11>>2]|0;
  $13 = $2;
  $14 = ((($13)) + 8|0);
  $15 = HEAP32[$14>>2]|0;
  $16 = (($15) + 1)|0;
  $17 = (($12) + ($16)|0);
  $18 = HEAP8[$17>>0]|0;
  $1 = $18;
  $19 = $1;
  STACKTOP = sp;return ($19|0);
 }
 return (0)|0;
}
function _fus_lexer_parse_int($0) {
 $0 = $0|0;
 var $1 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0;
 var $28 = 0, $29 = 0, $3 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $1 = $0;
 $3 = $1;
 _fus_lexer_start_token($3);
 $4 = $1;
 $5 = HEAP32[$4>>2]|0;
 $6 = $1;
 $7 = ((($6)) + 8|0);
 $8 = HEAP32[$7>>2]|0;
 $9 = (($5) + ($8)|0);
 $10 = HEAP8[$9>>0]|0;
 $11 = $10 << 24 >> 24;
 $12 = ($11|0)==(45);
 if ($12) {
  $13 = $1;
  (_fus_lexer_eat($13)|0);
 }
 while(1) {
  $14 = $1;
  $15 = ((($14)) + 8|0);
  $16 = HEAP32[$15>>2]|0;
  $17 = $1;
  $18 = ((($17)) + 4|0);
  $19 = HEAP32[$18>>2]|0;
  $20 = ($16>>>0)<($19>>>0);
  if (!($20)) {
   label = 6;
   break;
  }
  $21 = $1;
  $22 = HEAP32[$21>>2]|0;
  $23 = $1;
  $24 = ((($23)) + 8|0);
  $25 = HEAP32[$24>>2]|0;
  $26 = (($22) + ($25)|0);
  $27 = HEAP8[$26>>0]|0;
  $2 = $27;
  $28 = $2;
  $29 = $28 << 24 >> 24;
  $30 = (_isdigit($29)|0);
  $31 = ($30|0)!=(0);
  if (!($31)) {
   label = 6;
   break;
  }
  $32 = $1;
  (_fus_lexer_eat($32)|0);
 }
 if ((label|0) == 6) {
  $33 = $1;
  _fus_lexer_end_token($33);
  STACKTOP = sp;return;
 }
}
function _fus_lexer_parse_str($0) {
 $0 = $0|0;
 var $1 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0;
 var $28 = 0, $29 = 0, $3 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $4 = 0, $40 = 0, $41 = 0, $42 = 0, $43 = 0, $44 = 0, $5 = 0;
 var $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $2 = $0;
 $5 = $2;
 _fus_lexer_start_token($5);
 $6 = $2;
 (_fus_lexer_eat($6)|0);
 while(1) {
  $7 = $2;
  $8 = HEAP32[$7>>2]|0;
  $9 = $2;
  $10 = ((($9)) + 8|0);
  $11 = HEAP32[$10>>2]|0;
  $12 = (($8) + ($11)|0);
  $13 = HEAP8[$12>>0]|0;
  $3 = $13;
  $14 = $3;
  $15 = $14 << 24 >> 24;
  $16 = ($15|0)==(0);
  if ($16) {
   label = 10;
   break;
  }
  $17 = $3;
  $18 = $17 << 24 >> 24;
  $19 = ($18|0)==(10);
  if ($19) {
   label = 10;
   break;
  }
  $20 = $3;
  $21 = $20 << 24 >> 24;
  $22 = ($21|0)==(34);
  if ($22) {
   label = 5;
   break;
  }
  $25 = $3;
  $26 = $25 << 24 >> 24;
  $27 = ($26|0)==(92);
  if ($27) {
   $28 = $2;
   (_fus_lexer_eat($28)|0);
   $29 = $2;
   $30 = HEAP32[$29>>2]|0;
   $31 = $2;
   $32 = ((($31)) + 8|0);
   $33 = HEAP32[$32>>2]|0;
   $34 = (($30) + ($33)|0);
   $35 = HEAP8[$34>>0]|0;
   $4 = $35;
   $36 = $4;
   $37 = $36 << 24 >> 24;
   $38 = ($37|0)==(0);
   if ($38) {
    label = 10;
    break;
   }
   $39 = $4;
   $40 = $39 << 24 >> 24;
   $41 = ($40|0)==(10);
   if ($41) {
    label = 10;
    break;
   }
  }
  $42 = $2;
  (_fus_lexer_eat($42)|0);
 }
 if ((label|0) == 5) {
  $23 = $2;
  (_fus_lexer_eat($23)|0);
  $24 = $2;
  _fus_lexer_end_token($24);
  $1 = 0;
  $44 = $1;
  STACKTOP = sp;return ($44|0);
 }
 else if ((label|0) == 10) {
  $43 = $2;
  _fus_lexer_set_error($43,2);
  $1 = -1;
  $44 = $1;
  STACKTOP = sp;return ($44|0);
 }
 return (0)|0;
}
function _fus_lexer_parse_blockstr($0) {
 $0 = $0|0;
 var $1 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0;
 var $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $1 = $0;
 $3 = $1;
 _fus_lexer_start_token($3);
 $4 = $1;
 (_fus_lexer_eat($4)|0);
 $5 = $1;
 (_fus_lexer_eat($5)|0);
 while(1) {
  $6 = $1;
  $7 = ((($6)) + 8|0);
  $8 = HEAP32[$7>>2]|0;
  $9 = $1;
  $10 = ((($9)) + 4|0);
  $11 = HEAP32[$10>>2]|0;
  $12 = ($8>>>0)<($11>>>0);
  if (!($12)) {
   label = 6;
   break;
  }
  $13 = $1;
  $14 = HEAP32[$13>>2]|0;
  $15 = $1;
  $16 = ((($15)) + 8|0);
  $17 = HEAP32[$16>>2]|0;
  $18 = (($14) + ($17)|0);
  $19 = HEAP8[$18>>0]|0;
  $2 = $19;
  $20 = $2;
  $21 = $20 << 24 >> 24;
  $22 = ($21|0)==(0);
  if ($22) {
   label = 6;
   break;
  }
  $23 = $2;
  $24 = $23 << 24 >> 24;
  $25 = ($24|0)==(10);
  if ($25) {
   label = 6;
   break;
  }
  $26 = $1;
  (_fus_lexer_eat($26)|0);
 }
 if ((label|0) == 6) {
  $27 = $1;
  _fus_lexer_end_token($27);
  STACKTOP = sp;return;
 }
}
function _fus_lexer_parse_op($0) {
 $0 = $0|0;
 var $1 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0;
 var $28 = 0, $29 = 0, $3 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0;
 var sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $1 = $0;
 $3 = $1;
 _fus_lexer_start_token($3);
 while(1) {
  $4 = $1;
  $5 = ((($4)) + 8|0);
  $6 = HEAP32[$5>>2]|0;
  $7 = $1;
  $8 = ((($7)) + 4|0);
  $9 = HEAP32[$8>>2]|0;
  $10 = ($6>>>0)<($9>>>0);
  if (!($10)) {
   break;
  }
  $11 = $1;
  $12 = HEAP32[$11>>2]|0;
  $13 = $1;
  $14 = ((($13)) + 8|0);
  $15 = HEAP32[$14>>2]|0;
  $16 = (($12) + ($15)|0);
  $17 = HEAP8[$16>>0]|0;
  $2 = $17;
  $18 = $2;
  $19 = $18 << 24 >> 24;
  $20 = ($19|0)==(40);
  if ($20) {
   break;
  }
  $21 = $2;
  $22 = $21 << 24 >> 24;
  $23 = ($22|0)==(41);
  if ($23) {
   break;
  }
  $24 = $2;
  $25 = $24 << 24 >> 24;
  $26 = ($25|0)==(58);
  if ($26) {
   break;
  }
  $27 = $2;
  $28 = $27 << 24 >> 24;
  $29 = ($28|0)==(95);
  if ($29) {
   break;
  }
  $30 = $2;
  $31 = $30 << 24 >> 24;
  $32 = (_isgraph($31)|0);
  $33 = ($32|0)!=(0);
  if (!($33)) {
   break;
  }
  $34 = $2;
  $35 = $34 << 24 >> 24;
  $36 = (_isalnum($35)|0);
  $37 = ($36|0)!=(0);
  if ($37) {
   break;
  }
  $38 = $1;
  (_fus_lexer_eat($38)|0);
 }
 $39 = $1;
 _fus_lexer_end_token($39);
 STACKTOP = sp;return;
}
function _fus_lexer_eat_indent($0) {
 $0 = $0|0;
 var $1 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0;
 var $28 = 0, $29 = 0, $3 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $4 = 0, $40 = 0, $41 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0;
 var $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $2 = $0;
 $3 = 0;
 while(1) {
  $5 = $2;
  $6 = ((($5)) + 8|0);
  $7 = HEAP32[$6>>2]|0;
  $8 = $2;
  $9 = ((($8)) + 4|0);
  $10 = HEAP32[$9>>2]|0;
  $11 = ($7>>>0)<($10>>>0);
  if (!($11)) {
   break;
  }
  $12 = $2;
  $13 = HEAP32[$12>>2]|0;
  $14 = $2;
  $15 = ((($14)) + 8|0);
  $16 = HEAP32[$15>>2]|0;
  $17 = (($13) + ($16)|0);
  $18 = HEAP8[$17>>0]|0;
  $4 = $18;
  $19 = $4;
  $20 = $19 << 24 >> 24;
  $21 = ($20|0)==(32);
  if ($21) {
   $22 = $3;
   $23 = (($22) + 1)|0;
   $3 = $23;
   $24 = $2;
   (_fus_lexer_eat($24)|0);
   continue;
  }
  $25 = $4;
  $26 = $25 << 24 >> 24;
  $27 = ($26|0)==(10);
  if (!($27)) {
   label = 7;
   break;
  }
  $3 = 0;
  $28 = $2;
  (_fus_lexer_eat($28)|0);
 }
 if ((label|0) == 7) {
  $29 = $4;
  $30 = $29 << 24 >> 24;
  $31 = ($30|0)!=(0);
  if ($31) {
   $32 = $4;
   $33 = $32 << 24 >> 24;
   $34 = (_isspace($33)|0);
   $35 = ($34|0)!=(0);
   if ($35) {
    $36 = $2;
    _fus_lexer_set_error($36,1);
    $1 = -1;
    $41 = $1;
    STACKTOP = sp;return ($41|0);
   }
  }
 }
 $37 = $3;
 $38 = $2;
 $39 = ((($38)) + 32|0);
 HEAP32[$39>>2] = $37;
 $40 = $3;
 $1 = $40;
 $41 = $1;
 STACKTOP = sp;return ($41|0);
}
function _fus_lexer_pop_indent($0) {
 $0 = $0|0;
 var $1 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0;
 var $28 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $2 = $0;
 $4 = $2;
 $5 = ((($4)) + 292|0);
 $6 = HEAP32[$5>>2]|0;
 $7 = ($6|0)<=(0);
 $8 = $2;
 if ($7) {
  _fus_lexer_set_error($8,4);
  $1 = -1;
  $28 = $1;
  STACKTOP = sp;return ($28|0);
 }
 $9 = ((($8)) + 292|0);
 $10 = HEAP32[$9>>2]|0;
 $11 = (($10) + -1)|0;
 HEAP32[$9>>2] = $11;
 $12 = $2;
 $13 = ((($12)) + 36|0);
 $14 = $2;
 $15 = ((($14)) + 292|0);
 $16 = HEAP32[$15>>2]|0;
 $17 = (($13) + ($16<<2)|0);
 $18 = HEAP32[$17>>2]|0;
 $3 = $18;
 $19 = $3;
 $20 = ($19|0)<(0);
 $21 = $2;
 if ($20) {
  _fus_lexer_set_error($21,5);
  $1 = -1;
  $28 = $1;
  STACKTOP = sp;return ($28|0);
 } else {
  $22 = ((($21)) + 36|0);
  $23 = $2;
  $24 = ((($23)) + 292|0);
  $25 = HEAP32[$24>>2]|0;
  $26 = (($22) + ($25<<2)|0);
  HEAP32[$26>>2] = 0;
  $27 = $3;
  $1 = $27;
  $28 = $1;
  STACKTOP = sp;return ($28|0);
 }
 return (0)|0;
}
function _fus_lexer_mark_final($0) {
 $0 = $0|0;
 var $1 = 0, $2 = 0, $3 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $1 = $0;
 $2 = $1;
 $3 = ((($2)) + 12|0);
 HEAP8[$3>>0] = 1;
 STACKTOP = sp;return;
}
function _fus_lexer_is_ok($0) {
 $0 = $0|0;
 var $1 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $1 = $0;
 $2 = $1;
 $3 = ((($2)) + 308|0);
 $4 = HEAP32[$3>>2]|0;
 $5 = ($4|0)!=(0);
 if ($5) {
  $6 = $1;
  $7 = ((($6)) + 308|0);
  $8 = HEAP32[$7>>2]|0;
  $9 = ($8|0)!=(7);
  if ($9) {
   $10 = $1;
   $11 = ((($10)) + 308|0);
   $12 = HEAP32[$11>>2]|0;
   $13 = ($12|0)!=(1);
   $14 = $13;
  } else {
   $14 = 0;
  }
 } else {
  $14 = 0;
 }
 STACKTOP = sp;return ($14|0);
}
function _fus_lexer_is_done($0) {
 $0 = $0|0;
 var $1 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $1 = $0;
 $2 = $1;
 $3 = ((($2)) + 308|0);
 $4 = HEAP32[$3>>2]|0;
 $5 = ($4|0)==(0);
 STACKTOP = sp;return ($5|0);
}
function _fus_lexer_is_split($0) {
 $0 = $0|0;
 var $1 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $1 = $0;
 $2 = $1;
 $3 = ((($2)) + 308|0);
 $4 = HEAP32[$3>>2]|0;
 $5 = ($4|0)==(7);
 STACKTOP = sp;return ($5|0);
}
function _fus_lexer_got($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0;
 var sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $2 = $0;
 $3 = $1;
 $4 = $2;
 $5 = ((($4)) + 304|0);
 $6 = HEAP32[$5>>2]|0;
 $7 = $3;
 $8 = (_strlen($7)|0);
 $9 = ($6|0)==($8|0);
 if (!($9)) {
  $20 = 0;
  STACKTOP = sp;return ($20|0);
 }
 $10 = $3;
 $11 = $2;
 $12 = ((($11)) + 300|0);
 $13 = HEAP32[$12>>2]|0;
 $14 = $2;
 $15 = ((($14)) + 304|0);
 $16 = HEAP32[$15>>2]|0;
 $17 = (_strncmp($10,$13,$16)|0);
 $18 = ($17|0)!=(0);
 $19 = $18 ^ 1;
 $20 = $19;
 STACKTOP = sp;return ($20|0);
}
function _fus_lexer_pinfo($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0;
 var $29 = 0, $3 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, $vararg_buffer = 0, $vararg_ptr1 = 0, $vararg_ptr2 = 0, $vararg_ptr3 = 0, $vararg_ptr4 = 0, $vararg_ptr5 = 0;
 var $vararg_ptr6 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 48|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(48|0);
 $vararg_buffer = sp;
 $2 = $0;
 $3 = $1;
 $6 = $2;
 $7 = ((($6)) + 304|0);
 $8 = HEAP32[$7>>2]|0;
 $4 = $8;
 $5 = 11164;
 $9 = $4;
 $10 = ($9|0)>(10);
 if ($10) {
  $4 = 10;
  $5 = 1067;
 }
 $11 = $3;
 $12 = $2;
 $13 = ((($12)) + 16|0);
 $14 = HEAP32[$13>>2]|0;
 $15 = $2;
 $16 = ((($15)) + 24|0);
 $17 = HEAP32[$16>>2]|0;
 $18 = (($17) + 1)|0;
 $19 = $2;
 $20 = ((($19)) + 28|0);
 $21 = HEAP32[$20>>2]|0;
 $22 = $2;
 $23 = ((($22)) + 304|0);
 $24 = HEAP32[$23>>2]|0;
 $25 = (($21) - ($24))|0;
 $26 = (($25) + 1)|0;
 $27 = $2;
 $28 = ((($27)) + 308|0);
 $29 = HEAP32[$28>>2]|0;
 $30 = (_fus_lexer_token_type_msg($29)|0);
 $31 = $4;
 $32 = $2;
 $33 = ((($32)) + 300|0);
 $34 = HEAP32[$33>>2]|0;
 $35 = $5;
 HEAP32[$vararg_buffer>>2] = $14;
 $vararg_ptr1 = ((($vararg_buffer)) + 4|0);
 HEAP32[$vararg_ptr1>>2] = $18;
 $vararg_ptr2 = ((($vararg_buffer)) + 8|0);
 HEAP32[$vararg_ptr2>>2] = $26;
 $vararg_ptr3 = ((($vararg_buffer)) + 12|0);
 HEAP32[$vararg_ptr3>>2] = $30;
 $vararg_ptr4 = ((($vararg_buffer)) + 16|0);
 HEAP32[$vararg_ptr4>>2] = $31;
 $vararg_ptr5 = ((($vararg_buffer)) + 20|0);
 HEAP32[$vararg_ptr5>>2] = $34;
 $vararg_ptr6 = ((($vararg_buffer)) + 24|0);
 HEAP32[$vararg_ptr6>>2] = $35;
 (_fprintf($11,1071,$vararg_buffer)|0);
 STACKTOP = sp;return;
}
function _fus_obj_init($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $2 = $0;
 $3 = $1;
 $4 = $3;
 $5 = $2;
 $6 = ((($5)) + 48|0);
 _fus_array_init($4,$6);
 $7 = $2;
 $8 = $3;
 $9 = ((($8)) + 16|0);
 _fus_arr_init($7,$9);
 STACKTOP = sp;return;
}
function _fus_obj_copy($0,$1,$2) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 var $$byval_copy = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0;
 var $29 = 0, $3 = 0, $30 = 0, $31 = 0, $32 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 32|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(32|0);
 $$byval_copy = sp + 24|0;
 $3 = $0;
 $4 = $1;
 $5 = $2;
 $9 = $4;
 $10 = $5;
 _fus_array_copy($9,$10);
 $11 = $3;
 $12 = $4;
 $13 = ((($12)) + 16|0);
 $14 = $5;
 $15 = ((($14)) + 16|0);
 _fus_arr_copy($11,$13,$15);
 $16 = $5;
 $17 = ((($16)) + 16|0);
 $18 = ((($17)) + 4|0);
 $19 = HEAP32[$18>>2]|0;
 $6 = $19;
 $20 = $5;
 $21 = ((($20)) + 16|0);
 $22 = ((($21)) + 8|0);
 $23 = HEAP32[$22>>2]|0;
 $7 = $23;
 $8 = 0;
 while(1) {
  $24 = $8;
  $25 = $7;
  $26 = ($24|0)<($25|0);
  if (!($26)) {
   break;
  }
  $27 = $3;
  $28 = $6;
  $29 = $8;
  $30 = (($28) + ($29<<2)|0);
  ;HEAP32[$$byval_copy>>2]=HEAP32[$30>>2]|0;
  _fus_value_attach($27,$$byval_copy);
  $31 = $8;
  $32 = (($31) + 1)|0;
  $8 = $32;
 }
 STACKTOP = sp;return;
}
function _fus_obj_cleanup($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $2 = $0;
 $3 = $1;
 $4 = $3;
 _fus_array_cleanup($4);
 $5 = $2;
 $6 = $3;
 $7 = ((($6)) + 16|0);
 _fus_arr_cleanup($5,$7);
 STACKTOP = sp;return;
}
function _fus_obj_find($0,$1,$2) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 var $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0, $29 = 0;
 var $3 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 32|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(32|0);
 $4 = $0;
 $5 = $1;
 $6 = $2;
 $11 = $5;
 $12 = ((($11)) + 8|0);
 $13 = HEAP32[$12>>2]|0;
 $7 = $13;
 $14 = $5;
 $15 = ((($14)) + 4|0);
 $16 = HEAP32[$15>>2]|0;
 $17 = $5;
 $18 = HEAP32[$17>>2]|0;
 $19 = ((($18)) + 8|0);
 $20 = HEAP32[$19>>2]|0;
 $21 = 0;
 $22 = (($16) + ($21)|0);
 $8 = $22;
 $9 = 0;
 while(1) {
  $23 = $9;
  $24 = $7;
  $25 = ($23|0)<($24|0);
  if (!($25)) {
   label = 6;
   break;
  }
  $26 = $8;
  $27 = $9;
  $28 = (($26) + ($27<<2)|0);
  $29 = HEAP32[$28>>2]|0;
  $10 = $29;
  $30 = $10;
  $31 = $6;
  $32 = ($30|0)==($31|0);
  $33 = $9;
  if ($32) {
   label = 4;
   break;
  }
  $34 = (($33) + 1)|0;
  $9 = $34;
 }
 if ((label|0) == 4) {
  $3 = $33;
  $35 = $3;
  STACKTOP = sp;return ($35|0);
 }
 else if ((label|0) == 6) {
  $3 = -1;
  $35 = $3;
  STACKTOP = sp;return ($35|0);
 }
 return (0)|0;
}
function _fus_obj_get($0,$1,$2,$3) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 $3 = $3|0;
 var $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0, $29 = 0;
 var $30 = 0, $31 = 0, $32 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, $vararg_buffer = 0, $vararg_ptr1 = 0, $vararg_ptr2 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 48|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(48|0);
 $vararg_buffer = sp;
 $10 = sp + 12|0;
 $4 = $1;
 $5 = $2;
 $6 = $3;
 $11 = $4;
 $12 = $5;
 $13 = $6;
 $14 = (_fus_obj_find($11,$12,$13)|0);
 $7 = $14;
 $15 = $7;
 $16 = ($15|0)<(0);
 if ($16) {
  $17 = $4;
  $18 = ((($17)) + 4|0);
  $19 = HEAP32[$18>>2]|0;
  $20 = $6;
  $21 = (_fus_symtable_get_token_safe($19,$20)|0);
  $8 = $21;
  $22 = HEAP32[54]|0;
  $23 = $8;
  $24 = $6;
  HEAP32[$vararg_buffer>>2] = 1140;
  $vararg_ptr1 = ((($vararg_buffer)) + 4|0);
  HEAP32[$vararg_ptr1>>2] = $23;
  $vararg_ptr2 = ((($vararg_buffer)) + 8|0);
  HEAP32[$vararg_ptr2>>2] = $24;
  (_fprintf($22,1109,$vararg_buffer)|0);
  $25 = $4;
  _fus_value_err($0,$25,5);
  STACKTOP = sp;return;
 } else {
  $26 = $5;
  $27 = ((($26)) + 16|0);
  $28 = ((($27)) + 4|0);
  $29 = HEAP32[$28>>2]|0;
  $9 = $29;
  $30 = $9;
  $31 = $7;
  $32 = (($30) + ($31<<2)|0);
  ;HEAP32[$10>>2]=HEAP32[$32>>2]|0;
  ;HEAP32[$0>>2]=HEAP32[$10>>2]|0;
  STACKTOP = sp;return;
 }
}
function _fus_obj_set($0,$1,$2,$3) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 $3 = $3|0;
 var $$byval_copy = 0, $$byval_copy1 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0;
 var $28 = 0, $29 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $4 = 0, $40 = 0, $41 = 0, $42 = 0, $43 = 0, $44 = 0, $45 = 0, $5 = 0;
 var $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 32|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(32|0);
 $$byval_copy1 = sp + 28|0;
 $$byval_copy = sp + 24|0;
 $4 = $0;
 $5 = $1;
 $6 = $2;
 $10 = $4;
 $11 = $5;
 $12 = $6;
 $13 = (_fus_obj_find($10,$11,$12)|0);
 $7 = $13;
 $14 = $7;
 $15 = ($14|0)>=(0);
 $16 = $5;
 if ($15) {
  $17 = ((($16)) + 16|0);
  $18 = ((($17)) + 4|0);
  $19 = HEAP32[$18>>2]|0;
  $8 = $19;
  $20 = $4;
  $21 = $8;
  $22 = $7;
  $23 = (($21) + ($22<<2)|0);
  ;HEAP32[$$byval_copy>>2]=HEAP32[$23>>2]|0;
  _fus_value_detach($20,$$byval_copy);
  $24 = $8;
  $25 = $7;
  $26 = (($24) + ($25<<2)|0);
  ;HEAP32[$26>>2]=HEAP32[$3>>2]|0;
  STACKTOP = sp;return;
 } else {
  _fus_array_push($16);
  $27 = $5;
  $28 = ((($27)) + 4|0);
  $29 = HEAP32[$28>>2]|0;
  $30 = $5;
  $31 = HEAP32[$30>>2]|0;
  $32 = ((($31)) + 8|0);
  $33 = HEAP32[$32>>2]|0;
  $34 = 0;
  $35 = (($29) + ($34)|0);
  $9 = $35;
  $36 = $6;
  $37 = $9;
  $38 = $5;
  $39 = ((($38)) + 8|0);
  $40 = HEAP32[$39>>2]|0;
  $41 = (($40) - 1)|0;
  $42 = (($37) + ($41<<2)|0);
  HEAP32[$42>>2] = $36;
  $43 = $4;
  $44 = $5;
  $45 = ((($44)) + 16|0);
  ;HEAP32[$$byval_copy1>>2]=HEAP32[$3>>2]|0;
  _fus_arr_push($43,$45,$$byval_copy1);
  STACKTOP = sp;return;
 }
}
function _fus_boxed_obj_mkunique($0) {
 $0 = $0|0;
 var $1 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0;
 var $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $4 = sp;
 $1 = $0;
 $5 = $1;
 $6 = HEAP32[$5>>2]|0;
 $2 = $6;
 $7 = $2;
 $8 = ((($7)) + 8|0);
 $9 = HEAP32[$8>>2]|0;
 $10 = ($9|0)>(1);
 if (!($10)) {
  STACKTOP = sp;return;
 }
 $11 = $2;
 _fus_boxed_detach($11);
 $12 = $2;
 $13 = HEAP32[$12>>2]|0;
 _fus_value_obj($4,$13);
 $14 = HEAP32[$4>>2]|0;
 $3 = $14;
 $15 = $2;
 $16 = HEAP32[$15>>2]|0;
 $17 = $3;
 $18 = ((($17)) + 12|0);
 $19 = $2;
 $20 = ((($19)) + 12|0);
 _fus_obj_copy($16,$18,$20);
 $21 = $3;
 $22 = $1;
 HEAP32[$22>>2] = $21;
 STACKTOP = sp;return;
}
function _fus_value_obj($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $10 = 0, $11 = 0, $12 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $2 = $1;
 $4 = $2;
 $5 = HEAP32[$4>>2]|0;
 $6 = (_fus_malloc($5,68)|0);
 $3 = $6;
 $7 = $3;
 $8 = $2;
 _fus_boxed_init($7,$8,1);
 $9 = $2;
 $10 = $3;
 $11 = ((($10)) + 12|0);
 _fus_obj_init($9,$11);
 $12 = $3;
 HEAP32[$0>>2] = $12;
 STACKTOP = sp;return;
}
function _fus_value_obj_get($0,$1,$2,$3) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 $3 = $3|0;
 var $$byval_copy = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 32|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(32|0);
 $$byval_copy = sp + 16|0;
 $7 = sp;
 $4 = $1;
 $5 = $3;
 ;HEAP32[$$byval_copy>>2]=HEAP32[$2>>2]|0;
 $8 = (_fus_value_is_obj($$byval_copy)|0);
 if ($8) {
  $10 = HEAP32[$2>>2]|0;
  $11 = ((($10)) + 12|0);
  $6 = $11;
  $12 = $4;
  $13 = $6;
  $14 = $5;
  _fus_obj_get($7,$12,$13,$14);
  ;HEAP32[$0>>2]=HEAP32[$7>>2]|0;
  STACKTOP = sp;return;
 } else {
  $9 = $4;
  _fus_value_err($0,$9,0);
  STACKTOP = sp;return;
 }
}
function _fus_value_obj_set($0,$1,$2,$3) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 $3 = $3|0;
 var $$byval_copy = 0, $$byval_copy1 = 0, $$byval_copy2 = 0, $$byval_copy3 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $20 = 0, $21 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0;
 var $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 48|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(48|0);
 $$byval_copy3 = sp + 36|0;
 $$byval_copy2 = sp + 32|0;
 $$byval_copy1 = sp + 28|0;
 $$byval_copy = sp + 24|0;
 $7 = sp + 8|0;
 $8 = sp + 4|0;
 $4 = $0;
 $5 = $1;
 $6 = $2;
 $10 = $5;
 ;HEAP32[$7>>2]=HEAP32[$10>>2]|0;
 ;HEAP32[$$byval_copy>>2]=HEAP32[$7>>2]|0;
 $11 = (_fus_value_is_obj($$byval_copy)|0);
 if ($11) {
  _fus_boxed_obj_mkunique($7);
  $16 = HEAP32[$7>>2]|0;
  $17 = ((($16)) + 12|0);
  $9 = $17;
  $18 = $4;
  $19 = $9;
  $20 = $6;
  ;HEAP32[$$byval_copy3>>2]=HEAP32[$3>>2]|0;
  _fus_obj_set($18,$19,$20,$$byval_copy3);
  $21 = $5;
  ;HEAP32[$21>>2]=HEAP32[$7>>2]|0;
  STACKTOP = sp;return;
 } else {
  $12 = $4;
  ;HEAP32[$$byval_copy1>>2]=HEAP32[$7>>2]|0;
  _fus_value_detach($12,$$byval_copy1);
  $13 = $4;
  ;HEAP32[$$byval_copy2>>2]=HEAP32[$3>>2]|0;
  _fus_value_detach($13,$$byval_copy2);
  $14 = $5;
  $15 = $4;
  _fus_value_err($8,$15,0);
  ;HEAP32[$14>>2]=HEAP32[$8>>2]|0;
  STACKTOP = sp;return;
 }
}
function _fus_parser_init($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $10 = 0, $11 = 0, $12 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $2 = $0;
 $3 = $1;
 $4 = $3;
 $5 = $2;
 HEAP32[$5>>2] = $4;
 $6 = $2;
 $7 = ((($6)) + 4|0);
 $8 = $3;
 $9 = ((($8)) + 144|0);
 _fus_array_init($7,$9);
 $10 = $3;
 $11 = $2;
 $12 = ((($11)) + 20|0);
 _fus_arr_init($10,$12);
 STACKTOP = sp;return;
}
function _fus_parser_cleanup($0) {
 $0 = $0|0;
 var $1 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $1 = $0;
 $2 = $1;
 $3 = ((($2)) + 4|0);
 _fus_array_cleanup($3);
 $4 = $1;
 $5 = HEAP32[$4>>2]|0;
 $6 = $1;
 $7 = ((($6)) + 20|0);
 _fus_arr_cleanup($5,$7);
 STACKTOP = sp;return;
}
function _fus_parser_dump($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, $vararg_buffer = 0, $vararg_buffer1 = 0;
 var $vararg_buffer3 = 0, $vararg_buffer5 = 0, $vararg_buffer7 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 4176|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(4176|0);
 $vararg_buffer7 = sp + 32|0;
 $vararg_buffer5 = sp + 24|0;
 $vararg_buffer3 = sp + 16|0;
 $vararg_buffer1 = sp + 8|0;
 $vararg_buffer = sp;
 $4 = sp + 36|0;
 $2 = $0;
 $3 = $1;
 $5 = $3;
 (_fprintf($5,1152,$vararg_buffer)|0);
 $6 = $3;
 $7 = $2;
 $8 = ((($7)) + 4|0);
 $9 = ((($8)) + 8|0);
 $10 = HEAP32[$9>>2]|0;
 HEAP32[$vararg_buffer1>>2] = $10;
 (_fprintf($6,1161,$vararg_buffer1)|0);
 $11 = $3;
 (_fprintf($11,1185,$vararg_buffer3)|0);
 $12 = $3;
 (_fprintf($12,1196,$vararg_buffer5)|0);
 _fus_printer_init($4);
 $13 = $3;
 _fus_printer_set_file($4,$13);
 $14 = ((($4)) + 4120|0);
 HEAP32[$14>>2] = 2;
 $15 = $2;
 $16 = HEAP32[$15>>2]|0;
 $17 = $2;
 $18 = ((($17)) + 20|0);
 (_fus_printer_print_data($4,$16,$18,0,-1)|0);
 _fus_printer_cleanup($4);
 $19 = $3;
 (_fprintf($19,3141,$vararg_buffer7)|0);
 STACKTOP = sp;return;
}
function _fus_parser_parse_lexer($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0;
 var $29 = 0, $3 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $4 = 0, $40 = 0, $41 = 0, $42 = 0, $43 = 0, $44 = 0, $45 = 0, $46 = 0;
 var $47 = 0, $48 = 0, $49 = 0, $5 = 0, $50 = 0, $51 = 0, $52 = 0, $53 = 0, $54 = 0, $55 = 0, $56 = 0, $57 = 0, $58 = 0, $59 = 0, $6 = 0, $60 = 0, $61 = 0, $62 = 0, $63 = 0, $64 = 0;
 var $65 = 0, $66 = 0, $67 = 0, $68 = 0, $69 = 0, $7 = 0, $70 = 0, $71 = 0, $72 = 0, $73 = 0, $8 = 0, $9 = 0, $vararg_buffer = 0, $vararg_buffer1 = 0, $vararg_buffer3 = 0, $vararg_buffer6 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 64|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(64|0);
 $vararg_buffer6 = sp + 24|0;
 $vararg_buffer3 = sp + 16|0;
 $vararg_buffer1 = sp + 8|0;
 $vararg_buffer = sp;
 $3 = $0;
 $4 = $1;
 $8 = $3;
 $9 = HEAP32[$8>>2]|0;
 $5 = $9;
 $6 = 0;
 L1: while(1) {
  $10 = $4;
  $11 = (_fus_lexer_is_ok($10)|0);
  if (!($11)) {
   label = 22;
   break;
  }
  $12 = $4;
  $13 = ((($12)) + 308|0);
  $14 = HEAP32[$13>>2]|0;
  $7 = $14;
  $15 = $7;
  $16 = ($15|0)==(2);
  do {
   if ($16) {
    $17 = $3;
    $18 = $4;
    $19 = ((($18)) + 300|0);
    $20 = HEAP32[$19>>2]|0;
    $21 = $4;
    $22 = ((($21)) + 304|0);
    $23 = HEAP32[$22>>2]|0;
    $24 = (_fus_parser_tokenparse_int($17,$20,$23)|0);
    $25 = ($24|0)<(0);
    if ($25) {
     label = 5;
     break L1;
    }
   } else {
    $26 = $7;
    $27 = ($26|0)==(3);
    if ($27) {
     $28 = $3;
     $29 = $4;
     $30 = ((($29)) + 300|0);
     $31 = HEAP32[$30>>2]|0;
     $32 = $4;
     $33 = ((($32)) + 304|0);
     $34 = HEAP32[$33>>2]|0;
     $35 = (_fus_parser_tokenparse_sym($28,$31,$34)|0);
     $36 = ($35|0)<(0);
     if ($36) {
      label = 8;
      break L1;
     } else {
      break;
     }
    }
    $37 = $7;
    $38 = ($37|0)==(4);
    if ($38) {
     $39 = $3;
     $40 = $4;
     $41 = ((($40)) + 300|0);
     $42 = HEAP32[$41>>2]|0;
     $43 = $4;
     $44 = ((($43)) + 304|0);
     $45 = HEAP32[$44>>2]|0;
     $46 = (_fus_parser_tokenparse_str($39,$42,$45)|0);
     $47 = ($46|0)<(0);
     if ($47) {
      label = 11;
      break L1;
     } else {
      break;
     }
    }
    $48 = $7;
    $49 = ($48|0)==(5);
    if ($49) {
     $50 = $6;
     $51 = (($50) + 1)|0;
     $6 = $51;
     $52 = $3;
     $53 = (_fus_parser_push_arr($52)|0);
     $54 = ($53|0)<(0);
     if ($54) {
      label = 14;
      break L1;
     } else {
      break;
     }
    }
    $55 = $7;
    $56 = ($55|0)==(6);
    if (!($56)) {
     label = 20;
     break L1;
    }
    $57 = $6;
    $58 = ($57|0)<=(0);
    if ($58) {
     label = 17;
     break L1;
    }
    $63 = $6;
    $64 = (($63) + -1)|0;
    $6 = $64;
    $65 = $3;
    $66 = (_fus_parser_pop_arr($65)|0);
    $67 = ($66|0)<(0);
    if ($67) {
     label = 19;
     break L1;
    }
   }
  } while(0);
  $72 = $4;
  _fus_lexer_next($72);
 }
 if ((label|0) == 5) {
  $2 = -1;
  $73 = $2;
  STACKTOP = sp;return ($73|0);
 }
 else if ((label|0) == 8) {
  $2 = -1;
  $73 = $2;
  STACKTOP = sp;return ($73|0);
 }
 else if ((label|0) == 11) {
  $2 = -1;
  $73 = $2;
  STACKTOP = sp;return ($73|0);
 }
 else if ((label|0) == 14) {
  $2 = -1;
  $73 = $2;
  STACKTOP = sp;return ($73|0);
 }
 else if ((label|0) == 17) {
  $59 = HEAP32[54]|0;
  HEAP32[$vararg_buffer>>2] = 1206;
  (_fprintf($59,1201,$vararg_buffer)|0);
  $60 = $4;
  $61 = HEAP32[54]|0;
  _fus_lexer_pinfo($60,$61);
  $62 = HEAP32[54]|0;
  (_fprintf($62,1229,$vararg_buffer1)|0);
  $2 = -1;
  $73 = $2;
  STACKTOP = sp;return ($73|0);
 }
 else if ((label|0) == 19) {
  $2 = -1;
  $73 = $2;
  STACKTOP = sp;return ($73|0);
 }
 else if ((label|0) == 20) {
  $68 = HEAP32[54]|0;
  HEAP32[$vararg_buffer3>>2] = 1206;
  (_fprintf($68,1201,$vararg_buffer3)|0);
  $69 = $4;
  $70 = HEAP32[54]|0;
  _fus_lexer_pinfo($69,$70);
  $71 = HEAP32[54]|0;
  (_fprintf($71,1251,$vararg_buffer6)|0);
  $2 = -1;
  $73 = $2;
  STACKTOP = sp;return ($73|0);
 }
 else if ((label|0) == 22) {
  $2 = 0;
  $73 = $2;
  STACKTOP = sp;return ($73|0);
 }
 return (0)|0;
}
function _fus_parser_tokenparse_int($0,$1,$2) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 var $$byval_copy = 0, $10 = 0, $11 = 0, $12 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 32|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(32|0);
 $$byval_copy = sp + 16|0;
 $6 = sp;
 $3 = $0;
 $4 = $1;
 $5 = $2;
 $7 = $3;
 $8 = HEAP32[$7>>2]|0;
 $9 = $4;
 $10 = $5;
 _fus_value_tokenparse_int($6,$8,$9,$10);
 $11 = $3;
 ;HEAP32[$$byval_copy>>2]=HEAP32[$6>>2]|0;
 $12 = (_fus_parser_push_value($11,$$byval_copy)|0);
 STACKTOP = sp;return ($12|0);
}
function _fus_parser_tokenparse_sym($0,$1,$2) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 var $$byval_copy = 0, $10 = 0, $11 = 0, $12 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 32|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(32|0);
 $$byval_copy = sp + 16|0;
 $6 = sp;
 $3 = $0;
 $4 = $1;
 $5 = $2;
 $7 = $3;
 $8 = HEAP32[$7>>2]|0;
 $9 = $4;
 $10 = $5;
 _fus_value_tokenparse_sym($6,$8,$9,$10);
 $11 = $3;
 ;HEAP32[$$byval_copy>>2]=HEAP32[$6>>2]|0;
 $12 = (_fus_parser_push_value($11,$$byval_copy)|0);
 STACKTOP = sp;return ($12|0);
}
function _fus_parser_tokenparse_str($0,$1,$2) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 var $$byval_copy = 0, $10 = 0, $11 = 0, $12 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 32|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(32|0);
 $$byval_copy = sp + 16|0;
 $6 = sp;
 $3 = $0;
 $4 = $1;
 $5 = $2;
 $7 = $3;
 $8 = HEAP32[$7>>2]|0;
 $9 = $4;
 $10 = $5;
 _fus_value_tokenparse_str($6,$8,$9,$10);
 $11 = $3;
 ;HEAP32[$$byval_copy>>2]=HEAP32[$6>>2]|0;
 $12 = (_fus_parser_push_value($11,$$byval_copy)|0);
 STACKTOP = sp;return ($12|0);
}
function _fus_parser_push_arr($0) {
 $0 = $0|0;
 var $1 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0;
 var $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $1 = $0;
 $3 = $1;
 $4 = ((($3)) + 4|0);
 _fus_array_push($4);
 $5 = $1;
 $6 = ((($5)) + 4|0);
 $7 = ((($6)) + 4|0);
 $8 = HEAP32[$7>>2]|0;
 $9 = $1;
 $10 = ((($9)) + 4|0);
 $11 = ((($10)) + 8|0);
 $12 = HEAP32[$11>>2]|0;
 $13 = (($12) - 1)|0;
 $14 = $1;
 $15 = ((($14)) + 4|0);
 $16 = HEAP32[$15>>2]|0;
 $17 = ((($16)) + 8|0);
 $18 = HEAP32[$17>>2]|0;
 $19 = Math_imul($13, $18)|0;
 $20 = (($8) + ($19)|0);
 $2 = $20;
 $21 = $2;
 $22 = $1;
 $23 = ((($22)) + 20|0);
 ;HEAP32[$21>>2]=HEAP32[$23>>2]|0;HEAP32[$21+4>>2]=HEAP32[$23+4>>2]|0;HEAP32[$21+8>>2]=HEAP32[$23+8>>2]|0;HEAP32[$21+12>>2]=HEAP32[$23+12>>2]|0;
 $24 = $1;
 $25 = HEAP32[$24>>2]|0;
 $26 = $1;
 $27 = ((($26)) + 20|0);
 _fus_arr_init($25,$27);
 STACKTOP = sp;return 0;
}
function _fus_parser_pop_arr($0) {
 $0 = $0|0;
 var $$byval_copy = 0, $1 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0;
 var $27 = 0, $28 = 0, $29 = 0, $3 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $4 = 0, $40 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0;
 var $9 = 0, $vararg_buffer = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 32|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(32|0);
 $$byval_copy = sp + 20|0;
 $vararg_buffer = sp;
 $3 = sp + 8|0;
 $2 = $0;
 $5 = $2;
 $6 = ((($5)) + 4|0);
 $7 = ((($6)) + 8|0);
 $8 = HEAP32[$7>>2]|0;
 $9 = ($8|0)<=(0);
 if ($9) {
  $10 = HEAP32[54]|0;
  HEAP32[$vararg_buffer>>2] = 1304;
  (_fprintf($10,1269,$vararg_buffer)|0);
  $1 = -1;
  $40 = $1;
  STACKTOP = sp;return ($40|0);
 } else {
  $11 = $2;
  $12 = HEAP32[$11>>2]|0;
  $13 = $2;
  $14 = ((($13)) + 20|0);
  _fus_value_arr_from_arr($3,$12,$14);
  $15 = $2;
  $16 = ((($15)) + 4|0);
  $17 = ((($16)) + 4|0);
  $18 = HEAP32[$17>>2]|0;
  $19 = $2;
  $20 = ((($19)) + 4|0);
  $21 = ((($20)) + 8|0);
  $22 = HEAP32[$21>>2]|0;
  $23 = (($22) - 1)|0;
  $24 = $2;
  $25 = ((($24)) + 4|0);
  $26 = HEAP32[$25>>2]|0;
  $27 = ((($26)) + 8|0);
  $28 = HEAP32[$27>>2]|0;
  $29 = Math_imul($23, $28)|0;
  $30 = (($18) + ($29)|0);
  $4 = $30;
  $31 = $2;
  $32 = ((($31)) + 20|0);
  $33 = $4;
  ;HEAP32[$32>>2]=HEAP32[$33>>2]|0;HEAP32[$32+4>>2]=HEAP32[$33+4>>2]|0;HEAP32[$32+8>>2]=HEAP32[$33+8>>2]|0;HEAP32[$32+12>>2]=HEAP32[$33+12>>2]|0;
  $34 = $2;
  $35 = ((($34)) + 4|0);
  _fus_array_pop($35);
  $36 = $2;
  $37 = HEAP32[$36>>2]|0;
  $38 = $2;
  $39 = ((($38)) + 20|0);
  ;HEAP32[$$byval_copy>>2]=HEAP32[$3>>2]|0;
  _fus_arr_push($37,$39,$$byval_copy);
  $1 = 0;
  $40 = $1;
  STACKTOP = sp;return ($40|0);
 }
 return (0)|0;
}
function _fus_value_tokenparse_str($0,$1,$2,$3) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 $3 = $3|0;
 var $10 = 0, $100 = 0, $101 = 0, $102 = 0, $103 = 0, $104 = 0, $105 = 0, $106 = 0, $107 = 0, $108 = 0, $109 = 0, $11 = 0, $110 = 0, $111 = 0, $112 = 0, $113 = 0, $114 = 0, $115 = 0, $116 = 0, $117 = 0;
 var $118 = 0, $119 = 0, $12 = 0, $120 = 0, $121 = 0, $122 = 0, $123 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0;
 var $26 = 0, $27 = 0, $28 = 0, $29 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $4 = 0, $40 = 0, $41 = 0, $42 = 0, $43 = 0, $44 = 0;
 var $45 = 0, $46 = 0, $47 = 0, $48 = 0, $49 = 0, $5 = 0, $50 = 0, $51 = 0, $52 = 0, $53 = 0, $54 = 0, $55 = 0, $56 = 0, $57 = 0, $58 = 0, $59 = 0, $6 = 0, $60 = 0, $61 = 0, $62 = 0;
 var $63 = 0, $64 = 0, $65 = 0, $66 = 0, $67 = 0, $68 = 0, $69 = 0, $7 = 0, $70 = 0, $71 = 0, $72 = 0, $73 = 0, $74 = 0, $75 = 0, $76 = 0, $77 = 0, $78 = 0, $79 = 0, $8 = 0, $80 = 0;
 var $81 = 0, $82 = 0, $83 = 0, $84 = 0, $85 = 0, $86 = 0, $87 = 0, $88 = 0, $89 = 0, $9 = 0, $90 = 0, $91 = 0, $92 = 0, $93 = 0, $94 = 0, $95 = 0, $96 = 0, $97 = 0, $98 = 0, $99 = 0;
 var $vararg_buffer = 0, $vararg_buffer1 = 0, $vararg_buffer12 = 0, $vararg_buffer15 = 0, $vararg_buffer19 = 0, $vararg_buffer22 = 0, $vararg_buffer26 = 0, $vararg_buffer29 = 0, $vararg_buffer5 = 0, $vararg_buffer8 = 0, $vararg_ptr11 = 0, $vararg_ptr18 = 0, $vararg_ptr25 = 0, $vararg_ptr32 = 0, $vararg_ptr4 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 160|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(160|0);
 $vararg_buffer29 = sp + 72|0;
 $vararg_buffer26 = sp + 64|0;
 $vararg_buffer22 = sp + 56|0;
 $vararg_buffer19 = sp + 48|0;
 $vararg_buffer15 = sp + 40|0;
 $vararg_buffer12 = sp + 32|0;
 $vararg_buffer8 = sp + 24|0;
 $vararg_buffer5 = sp + 16|0;
 $vararg_buffer1 = sp + 8|0;
 $vararg_buffer = sp;
 $4 = $1;
 $5 = $2;
 $6 = $3;
 $7 = 0;
 $25 = $6;
 $26 = ($25|0)<(2);
 $27 = $5;
 do {
  if ($26) {
   $8 = $27;
   $28 = $6;
   $9 = $28;
   $29 = HEAP32[54]|0;
   HEAP32[$vararg_buffer>>2] = 1378;
   (_fprintf($29,1323,$vararg_buffer)|0);
   $30 = HEAP32[54]|0;
   $31 = $9;
   $32 = $8;
   HEAP32[$vararg_buffer1>>2] = $31;
   $vararg_ptr4 = ((($vararg_buffer1)) + 4|0);
   HEAP32[$vararg_ptr4>>2] = $32;
   (_fprintf($30,1403,$vararg_buffer1)|0);
  } else {
   $33 = HEAP8[$27>>0]|0;
   $34 = $33 << 24 >> 24;
   $35 = ($34|0)!=(34);
   if (!($35)) {
    $36 = $5;
    $37 = $6;
    $38 = (($37) - 1)|0;
    $39 = (($36) + ($38)|0);
    $40 = HEAP8[$39>>0]|0;
    $41 = $40 << 24 >> 24;
    $42 = ($41|0)!=(34);
    if (!($42)) {
     $49 = $6;
     $50 = (($49) - 2)|0;
     $51 = (($50) + 1)|0;
     $12 = $51;
     $52 = $4;
     $53 = HEAP32[$52>>2]|0;
     $54 = $12;
     $55 = (_fus_malloc($53,$54)|0);
     $7 = $55;
     $13 = 0;
     $14 = 1;
     $56 = $6;
     $57 = (($56) - 1)|0;
     $15 = $57;
     $58 = $14;
     $16 = $58;
     L7: while(1) {
      $59 = $16;
      $60 = $15;
      $61 = ($59|0)<($60|0);
      if (!($61)) {
       label = 19;
       break;
      }
      $62 = $5;
      $63 = $16;
      $64 = (($62) + ($63)|0);
      $65 = HEAP8[$64>>0]|0;
      $17 = $65;
      $66 = $17;
      $67 = $66 << 24 >> 24;
      $68 = ($67|0)==(0);
      if ($68) {
       label = 9;
       break;
      }
      $75 = $17;
      $76 = $75 << 24 >> 24;
      $77 = ($76|0)==(92);
      do {
       if ($77) {
        $78 = $16;
        $79 = (($78) + 1)|0;
        $16 = $79;
        $80 = $16;
        $81 = $15;
        $82 = ($80|0)>=($81|0);
        $83 = $5;
        if ($82) {
         label = 12;
         break L7;
        }
        $89 = $16;
        $90 = (($83) + ($89)|0);
        $91 = HEAP8[$90>>0]|0;
        $22 = $91;
        $92 = $22;
        $93 = $92 << 24 >> 24;
        $94 = (_strchr(1976,$93)|0);
        $95 = ($94|0)!=(0|0);
        $96 = $22;
        if ($95) {
         $17 = $96;
         break;
        }
        $97 = $96 << 24 >> 24;
        $98 = ($97|0)==(110);
        if (!($98)) {
         label = 17;
         break L7;
        }
        $17 = 10;
       }
      } while(0);
      $105 = $17;
      $106 = $7;
      $107 = $13;
      $108 = (($106) + ($107)|0);
      HEAP8[$108>>0] = $105;
      $109 = $13;
      $110 = (($109) + 1)|0;
      $13 = $110;
      $111 = $16;
      $112 = (($111) + 1)|0;
      $16 = $112;
     }
     if ((label|0) == 9) {
      $69 = $5;
      $18 = $69;
      $70 = $6;
      $19 = $70;
      $71 = HEAP32[54]|0;
      HEAP32[$vararg_buffer12>>2] = 1378;
      (_fprintf($71,1467,$vararg_buffer12)|0);
      $72 = HEAP32[54]|0;
      $73 = $19;
      $74 = $18;
      HEAP32[$vararg_buffer15>>2] = $73;
      $vararg_ptr18 = ((($vararg_buffer15)) + 4|0);
      HEAP32[$vararg_ptr18>>2] = $74;
      (_fprintf($72,1403,$vararg_buffer15)|0);
      break;
     }
     else if ((label|0) == 12) {
      $20 = $83;
      $84 = $6;
      $21 = $84;
      $85 = HEAP32[54]|0;
      HEAP32[$vararg_buffer19>>2] = 1378;
      (_fprintf($85,1555,$vararg_buffer19)|0);
      $86 = HEAP32[54]|0;
      $87 = $21;
      $88 = $20;
      HEAP32[$vararg_buffer22>>2] = $87;
      $vararg_ptr25 = ((($vararg_buffer22)) + 4|0);
      HEAP32[$vararg_ptr25>>2] = $88;
      (_fprintf($86,1403,$vararg_buffer22)|0);
      break;
     }
     else if ((label|0) == 17) {
      $99 = $5;
      $23 = $99;
      $100 = $6;
      $24 = $100;
      $101 = HEAP32[54]|0;
      HEAP32[$vararg_buffer26>>2] = 1378;
      (_fprintf($101,1592,$vararg_buffer26)|0);
      $102 = HEAP32[54]|0;
      $103 = $24;
      $104 = $23;
      HEAP32[$vararg_buffer29>>2] = $103;
      $vararg_ptr32 = ((($vararg_buffer29)) + 4|0);
      HEAP32[$vararg_ptr32>>2] = $104;
      (_fprintf($102,1403,$vararg_buffer29)|0);
      break;
     }
     else if ((label|0) == 19) {
      $113 = $7;
      $114 = $13;
      $115 = (($113) + ($114)|0);
      HEAP8[$115>>0] = 0;
      $116 = $4;
      $117 = $7;
      $118 = $13;
      $119 = $12;
      _fus_value_str($0,$116,$117,$118,$119);
      STACKTOP = sp;return;
     }
    }
   }
   $43 = $5;
   $10 = $43;
   $44 = $6;
   $11 = $44;
   $45 = HEAP32[54]|0;
   HEAP32[$vararg_buffer5>>2] = 1378;
   (_fprintf($45,1423,$vararg_buffer5)|0);
   $46 = HEAP32[54]|0;
   $47 = $11;
   $48 = $10;
   HEAP32[$vararg_buffer8>>2] = $47;
   $vararg_ptr11 = ((($vararg_buffer8)) + 4|0);
   HEAP32[$vararg_ptr11>>2] = $48;
   (_fprintf($46,1403,$vararg_buffer8)|0);
  }
 } while(0);
 $120 = $4;
 $121 = HEAP32[$120>>2]|0;
 $122 = $7;
 _fus_free($121,$122);
 $123 = $4;
 _fus_value_err($0,$123,4);
 STACKTOP = sp;return;
}
function _fus_parser_push_value($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $$byval_copy = 0, $$byval_copy1 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $$byval_copy1 = sp + 12|0;
 $$byval_copy = sp + 8|0;
 $3 = $0;
 ;HEAP32[$$byval_copy>>2]=HEAP32[$1>>2]|0;
 $4 = (_fus_value_is_err($$byval_copy)|0);
 if ($4) {
  $2 = -1;
  $9 = $2;
  STACKTOP = sp;return ($9|0);
 } else {
  $5 = $3;
  $6 = HEAP32[$5>>2]|0;
  $7 = $3;
  $8 = ((($7)) + 20|0);
  ;HEAP32[$$byval_copy1>>2]=HEAP32[$1>>2]|0;
  _fus_arr_push($6,$8,$$byval_copy1);
  $2 = 0;
  $9 = $2;
  STACKTOP = sp;return ($9|0);
 }
 return (0)|0;
}
function _fus_value_tokenparse_sym($0,$1,$2,$3) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 $3 = $3|0;
 var $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $4 = $1;
 $5 = $2;
 $6 = $3;
 $8 = $4;
 $9 = ((($8)) + 4|0);
 $10 = HEAP32[$9>>2]|0;
 $11 = $5;
 $12 = $6;
 $13 = (_fus_symtable_get_or_add_from_token($10,$11,$12)|0);
 $7 = $13;
 $14 = $4;
 $15 = $7;
 _fus_value_sym($0,$14,$15);
 STACKTOP = sp;return;
}
function _fus_value_tokenparse_int($0,$1,$2,$3) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 $3 = $3|0;
 var $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0, $29 = 0;
 var $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $4 = 0, $40 = 0, $41 = 0, $42 = 0, $43 = 0, $44 = 0, $45 = 0, $46 = 0, $47 = 0, $48 = 0;
 var $49 = 0, $5 = 0, $50 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 32|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(32|0);
 $4 = $1;
 $5 = $2;
 $6 = $3;
 $7 = 0;
 $12 = $5;
 $13 = HEAP8[$12>>0]|0;
 $14 = $13 << 24 >> 24;
 $15 = ($14|0)==(45);
 $16 = $15&1;
 $8 = $16;
 $17 = $8;
 $18 = $17&1;
 $19 = $18 ? 1 : 0;
 $9 = $19;
 while(1) {
  $20 = $9;
  $21 = $6;
  $22 = ($20|0)<($21|0);
  if (!($22)) {
   break;
  }
  $23 = $5;
  $24 = $9;
  $25 = (($23) + ($24)|0);
  $26 = HEAP8[$25>>0]|0;
  $27 = $26 << 24 >> 24;
  $28 = (($27) - 48)|0;
  $10 = $28;
  $29 = $10;
  $30 = (($29|0) / 10)&-1;
  $31 = (2147483647 - ($30))|0;
  $11 = $31;
  $32 = $7;
  $33 = $11;
  $34 = ($32|0)>($33|0);
  if ($34) {
   label = 4;
   break;
  }
  $39 = $7;
  $40 = ($39*10)|0;
  $41 = $10;
  $42 = (($40) + ($41))|0;
  $7 = $42;
  $43 = $9;
  $44 = (($43) + 1)|0;
  $9 = $44;
 }
 if ((label|0) == 4) {
  $35 = $4;
  $36 = $8;
  $37 = $36&1;
  $38 = $37 ? 2 : 1;
  _fus_value_err($0,$35,$38);
  STACKTOP = sp;return;
 }
 $45 = $8;
 $46 = $45&1;
 if ($46) {
  $47 = $7;
  $48 = (0 - ($47))|0;
  $7 = $48;
 }
 $49 = $4;
 $50 = $7;
 _fus_value_int($0,$49,$50);
 STACKTOP = sp;return;
}
function _fus_value_stringparse_int($0,$1,$2) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 var $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $3 = $1;
 $4 = $2;
 $5 = $3;
 $6 = $4;
 $7 = $4;
 $8 = (_strlen($7)|0);
 _fus_value_tokenparse_int($0,$5,$6,$8);
 STACKTOP = sp;return;
}
function _fus_parser_stringparse_int($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $2 = $0;
 $3 = $1;
 $4 = $2;
 $5 = $3;
 $6 = $3;
 $7 = (_strlen($6)|0);
 $8 = (_fus_parser_tokenparse_int($4,$5,$7)|0);
 STACKTOP = sp;return ($8|0);
}
function _fus_value_stringparse_sym($0,$1,$2) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 var $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $3 = $1;
 $4 = $2;
 $5 = $3;
 $6 = $4;
 $7 = $4;
 $8 = (_strlen($7)|0);
 _fus_value_tokenparse_sym($0,$5,$6,$8);
 STACKTOP = sp;return;
}
function _fus_parser_stringparse_sym($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $2 = $0;
 $3 = $1;
 $4 = $2;
 $5 = $3;
 $6 = $3;
 $7 = (_strlen($6)|0);
 $8 = (_fus_parser_tokenparse_sym($4,$5,$7)|0);
 STACKTOP = sp;return ($8|0);
}
function _fus_value_stringparse_str($0,$1,$2) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 var $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $3 = $1;
 $4 = $2;
 $5 = $3;
 $6 = $4;
 $7 = $4;
 $8 = (_strlen($7)|0);
 _fus_value_tokenparse_str($0,$5,$6,$8);
 STACKTOP = sp;return;
}
function _fus_parser_stringparse_str($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $2 = $0;
 $3 = $1;
 $4 = $2;
 $5 = $3;
 $6 = $3;
 $7 = (_strlen($6)|0);
 $8 = (_fus_parser_tokenparse_str($4,$5,$7)|0);
 STACKTOP = sp;return ($8|0);
}
function _fus_printer_init($0) {
 $0 = $0|0;
 var $1 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $1 = $0;
 $2 = $1;
 HEAP32[$2>>2] = 0;
 $3 = $1;
 $4 = HEAP32[21]|0;
 _fus_printer_set_file($3,$4);
 $5 = $1;
 $6 = ((($5)) + 4108|0);
 HEAP32[$6>>2] = 0;
 $7 = $1;
 $8 = ((($7)) + 4112|0);
 HEAP32[$8>>2] = 4095;
 $9 = $1;
 $10 = ((($9)) + 4116|0);
 HEAP8[$10>>0] = 0;
 $11 = $1;
 $12 = ((($11)) + 4117|0);
 HEAP8[$12>>0] = 0;
 $13 = $1;
 $14 = ((($13)) + 4120|0);
 HEAP32[$14>>2] = 0;
 $15 = $1;
 _fus_printer_set_style_full($15);
 STACKTOP = sp;return;
}
function _fus_printer_set_file($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $2 = 0, $3 = 0, $4 = 0, $5 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $2 = $0;
 $3 = $1;
 $4 = $2;
 $5 = $3;
 _fus_printer_set_flush($4,7,$5);
 STACKTOP = sp;return;
}
function _fus_printer_set_style_full($0) {
 $0 = $0|0;
 var $1 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $1 = $0;
 $2 = $1;
 $3 = ((($2)) + 4124|0);
 HEAP32[$3>>2] = 1634;
 $4 = $1;
 $5 = ((($4)) + 4128|0);
 HEAP32[$5>>2] = 3141;
 STACKTOP = sp;return;
}
function _fus_printer_flush_file($0) {
 $0 = $0|0;
 var $1 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $1 = $0;
 $3 = $1;
 $4 = ((($3)) + 8|0);
 $5 = HEAP32[$4>>2]|0;
 $2 = $5;
 $6 = $1;
 $7 = ((($6)) + 12|0);
 $8 = $1;
 $9 = ((($8)) + 4108|0);
 $10 = HEAP32[$9>>2]|0;
 $11 = (($7) + ($10)|0);
 HEAP8[$11>>0] = 0;
 $12 = $1;
 $13 = ((($12)) + 12|0);
 $14 = $2;
 $15 = (_fputs($13,$14)|0);
 STACKTOP = sp;return ($15|0);
}
function _fus_printer_set_flush($0,$1,$2) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 var $10 = 0, $11 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $3 = $0;
 $4 = $1;
 $5 = $2;
 $6 = $4;
 $7 = $3;
 $8 = ((($7)) + 4|0);
 HEAP32[$8>>2] = $6;
 $9 = $5;
 $10 = $3;
 $11 = ((($10)) + 8|0);
 HEAP32[$11>>2] = $9;
 STACKTOP = sp;return;
}
function _fus_printer_cleanup($0) {
 $0 = $0|0;
 var $1 = 0, $2 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $1 = $0;
 $2 = $1;
 (_fus_printer_flush($2)|0);
 STACKTOP = sp;return;
}
function _fus_printer_flush($0) {
 $0 = $0|0;
 var $1 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, $vararg_buffer = 0;
 var $vararg_ptr1 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $vararg_buffer = sp;
 $1 = $0;
 $3 = $1;
 $4 = HEAP32[$3>>2]|0;
 $5 = ($4|0)>=(1);
 if ($5) {
  $6 = HEAP32[54]|0;
  $7 = $1;
  $8 = ((($7)) + 4108|0);
  $9 = HEAP32[$8>>2]|0;
  $10 = $1;
  $11 = ((($10)) + 12|0);
  HEAP32[$vararg_buffer>>2] = $9;
  $vararg_ptr1 = ((($vararg_buffer)) + 4|0);
  HEAP32[$vararg_ptr1>>2] = $11;
  (_fprintf($6,1637,$vararg_buffer)|0);
 }
 $12 = $1;
 $13 = ((($12)) + 4|0);
 $14 = HEAP32[$13>>2]|0;
 $15 = $1;
 $16 = (FUNCTION_TABLE_ii[$14 & 7]($15)|0);
 $2 = $16;
 $17 = $1;
 $18 = ((($17)) + 4108|0);
 HEAP32[$18>>2] = 0;
 $19 = $2;
 STACKTOP = sp;return ($19|0);
}
function _fus_printer_set_style_inline($0) {
 $0 = $0|0;
 var $1 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $1 = $0;
 $2 = $1;
 $3 = ((($2)) + 4124|0);
 HEAP32[$3>>2] = 11164;
 $4 = $1;
 $5 = ((($4)) + 4128|0);
 HEAP32[$5>>2] = 1655;
 STACKTOP = sp;return;
}
function _fus_printer_write($0,$1,$2) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 var $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0, $29 = 0;
 var $3 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $4 = 0, $40 = 0, $41 = 0, $42 = 0, $43 = 0, $44 = 0, $45 = 0, $46 = 0, $47 = 0;
 var $48 = 0, $49 = 0, $5 = 0, $50 = 0, $51 = 0, $52 = 0, $53 = 0, $54 = 0, $55 = 0, $56 = 0, $57 = 0, $58 = 0, $59 = 0, $6 = 0, $60 = 0, $61 = 0, $62 = 0, $63 = 0, $64 = 0, $65 = 0;
 var $66 = 0, $67 = 0, $68 = 0, $69 = 0, $7 = 0, $70 = 0, $8 = 0, $9 = 0, $vararg_buffer = 0, $vararg_buffer12 = 0, $vararg_buffer2 = 0, $vararg_buffer8 = 0, $vararg_ptr1 = 0, $vararg_ptr11 = 0, $vararg_ptr15 = 0, $vararg_ptr5 = 0, $vararg_ptr6 = 0, $vararg_ptr7 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 64|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(64|0);
 $vararg_buffer12 = sp + 32|0;
 $vararg_buffer8 = sp + 24|0;
 $vararg_buffer2 = sp + 8|0;
 $vararg_buffer = sp;
 $3 = $0;
 $4 = $1;
 $5 = $2;
 $6 = $3;
 $7 = HEAP32[$6>>2]|0;
 $8 = ($7|0)>=(1);
 if ($8) {
  $9 = HEAP32[54]|0;
  $10 = $5;
  $11 = $4;
  HEAP32[$vararg_buffer>>2] = $10;
  $vararg_ptr1 = ((($vararg_buffer)) + 4|0);
  HEAP32[$vararg_ptr1>>2] = $11;
  (_fprintf($9,1657,$vararg_buffer)|0);
 }
 $12 = $3;
 $13 = ((($12)) + 4108|0);
 $14 = HEAP32[$13>>2]|0;
 $15 = $5;
 $16 = (($14) + ($15))|0;
 $17 = $3;
 $18 = ((($17)) + 4112|0);
 $19 = HEAP32[$18>>2]|0;
 $20 = ($16|0)>($19|0);
 if ($20) {
  $21 = $3;
  (_fus_printer_flush($21)|0);
 }
 $22 = $3;
 $23 = ((($22)) + 4108|0);
 $24 = HEAP32[$23>>2]|0;
 $25 = $5;
 $26 = (($24) + ($25))|0;
 $27 = $3;
 $28 = ((($27)) + 4112|0);
 $29 = HEAP32[$28>>2]|0;
 $30 = ($26|0)>($29|0);
 if ($30) {
  $31 = HEAP32[54]|0;
  $32 = $3;
  $33 = ((($32)) + 4108|0);
  $34 = HEAP32[$33>>2]|0;
  $35 = $5;
  $36 = $3;
  $37 = ((($36)) + 4112|0);
  $38 = HEAP32[$37>>2]|0;
  HEAP32[$vararg_buffer2>>2] = 1730;
  $vararg_ptr5 = ((($vararg_buffer2)) + 4|0);
  HEAP32[$vararg_ptr5>>2] = $34;
  $vararg_ptr6 = ((($vararg_buffer2)) + 8|0);
  HEAP32[$vararg_ptr6>>2] = $35;
  $vararg_ptr7 = ((($vararg_buffer2)) + 12|0);
  HEAP32[$vararg_ptr7>>2] = $38;
  (_fprintf($31,1674,$vararg_buffer2)|0);
  $39 = HEAP32[54]|0;
  $40 = $5;
  $41 = $4;
  HEAP32[$vararg_buffer8>>2] = $40;
  $vararg_ptr11 = ((($vararg_buffer8)) + 4|0);
  HEAP32[$vararg_ptr11>>2] = $41;
  (_fprintf($39,1748,$vararg_buffer8)|0);
  $42 = $3;
  $43 = ((($42)) + 4112|0);
  $44 = HEAP32[$43>>2]|0;
  $45 = $3;
  $46 = ((($45)) + 4108|0);
  $47 = HEAP32[$46>>2]|0;
  $48 = (($44) - ($47))|0;
  $5 = $48;
 }
 $49 = $3;
 $50 = ((($49)) + 12|0);
 $51 = $3;
 $52 = ((($51)) + 4108|0);
 $53 = HEAP32[$52>>2]|0;
 $54 = (($50) + ($53)|0);
 $55 = $4;
 $56 = $5;
 (_strncpy($54,$55,$56)|0);
 $57 = $5;
 $58 = $3;
 $59 = ((($58)) + 4108|0);
 $60 = HEAP32[$59>>2]|0;
 $61 = (($60) + ($57))|0;
 HEAP32[$59>>2] = $61;
 $62 = $3;
 $63 = HEAP32[$62>>2]|0;
 $64 = ($63|0)>=(2);
 if (!($64)) {
  STACKTOP = sp;return;
 }
 $65 = HEAP32[54]|0;
 $66 = $3;
 $67 = ((($66)) + 4108|0);
 $68 = HEAP32[$67>>2]|0;
 $69 = $3;
 $70 = ((($69)) + 12|0);
 HEAP32[$vararg_buffer12>>2] = $68;
 $vararg_ptr15 = ((($vararg_buffer12)) + 4|0);
 HEAP32[$vararg_ptr15>>2] = $70;
 (_fprintf($65,1764,$vararg_buffer12)|0);
 STACKTOP = sp;return;
}
function _fus_printer_write_char($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $2 = 0, $3 = 0, $4 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $3 = sp + 4|0;
 $2 = $0;
 HEAP8[$3>>0] = $1;
 $4 = $2;
 _fus_printer_write($4,$3,1);
 STACKTOP = sp;return;
}
function _fus_printer_write_text($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $2 = $0;
 $3 = $1;
 $4 = $2;
 $5 = $3;
 $6 = $3;
 $7 = (_strlen($6)|0);
 _fus_printer_write($4,$5,$7);
 STACKTOP = sp;return;
}
function _fus_printer_write_long_int($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $10 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $2 = $0;
 $3 = $1;
 $5 = $3;
 $6 = (_fus_write_long_int($5)|0);
 $4 = $6;
 $7 = $4;
 $8 = ($7|0)!=(0|0);
 if (!($8)) {
  STACKTOP = sp;return;
 }
 $9 = $2;
 $10 = $4;
 _fus_printer_write_text($9,$10);
 STACKTOP = sp;return;
}
function _fus_printer_write_tabs($0) {
 $0 = $0|0;
 var $1 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $1 = $0;
 $4 = $1;
 $5 = ((($4)) + 4120|0);
 $6 = HEAP32[$5>>2]|0;
 $2 = $6;
 $3 = 0;
 while(1) {
  $7 = $3;
  $8 = $2;
  $9 = ($7|0)<($8|0);
  if (!($9)) {
   break;
  }
  $10 = $1;
  $11 = $1;
  $12 = ((($11)) + 4124|0);
  $13 = HEAP32[$12>>2]|0;
  _fus_printer_write_text($10,$13);
  $14 = $3;
  $15 = (($14) + 1)|0;
  $3 = $15;
 }
 STACKTOP = sp;return;
}
function _fus_printer_write_newline($0) {
 $0 = $0|0;
 var $1 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $1 = $0;
 $2 = $1;
 $3 = $1;
 $4 = ((($3)) + 4128|0);
 $5 = HEAP32[$4>>2]|0;
 _fus_printer_write_text($2,$5);
 $6 = $1;
 _fus_printer_write_tabs($6);
 STACKTOP = sp;return;
}
function _fus_printer_write_value($0,$1,$2) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 var $$byval_copy = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0;
 var $29 = 0, $3 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $4 = 0, $40 = 0, $41 = 0, $42 = 0, $43 = 0, $44 = 0, $45 = 0, $46 = 0;
 var $47 = 0, $48 = 0, $49 = 0, $5 = 0, $50 = 0, $51 = 0, $52 = 0, $53 = 0, $54 = 0, $55 = 0, $56 = 0, $57 = 0, $58 = 0, $59 = 0, $6 = 0, $60 = 0, $61 = 0, $62 = 0, $63 = 0, $64 = 0;
 var $65 = 0, $66 = 0, $67 = 0, $68 = 0, $69 = 0, $7 = 0, $70 = 0, $8 = 0, $9 = 0, $vararg_buffer = 0, $vararg_buffer1 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 64|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(64|0);
 $$byval_copy = sp + 52|0;
 $vararg_buffer1 = sp + 8|0;
 $vararg_buffer = sp;
 $5 = sp + 40|0;
 $6 = sp + 36|0;
 $7 = sp + 32|0;
 $12 = sp + 12|0;
 $3 = $0;
 $4 = $1;
 $13 = HEAP32[$2>>2]|0;
 $14 = $13 & 3;
 $15 = ($14|0)==(0);
 if ($15) {
  $16 = HEAP32[$2>>2]|0;
  $17 = ($16|0)!=(0|0);
  if ($17) {
   $18 = $3;
   $19 = HEAP32[$2>>2]|0;
   _fus_printer_write_boxed($18,$19);
   STACKTOP = sp;return;
  }
 }
 $20 = HEAP32[$2>>2]|0;
 HEAP32[$5>>2] = 3;
 $21 = HEAP32[$5>>2]|0;
 $22 = ($20|0)==($21|0);
 if ($22) {
  $23 = $3;
  _fus_printer_write_text($23,2075);
  STACKTOP = sp;return;
 }
 $24 = HEAP32[$2>>2]|0;
 HEAP32[$6>>2] = 7;
 $25 = HEAP32[$6>>2]|0;
 $26 = ($24|0)==($25|0);
 if ($26) {
  $27 = $3;
  _fus_printer_write_text($27,1780);
  STACKTOP = sp;return;
 }
 $28 = HEAP32[$2>>2]|0;
 HEAP32[$7>>2] = 11;
 $29 = HEAP32[$7>>2]|0;
 $30 = ($28|0)==($29|0);
 if ($30) {
  $31 = $3;
  _fus_printer_write_text($31,1782);
  STACKTOP = sp;return;
 }
 $32 = HEAP32[$2>>2]|0;
 $33 = $32 & 3;
 $34 = ($33|0)==(1);
 $35 = HEAP32[$2>>2]|0;
 if ($34) {
  $36 = $35 >> 2;
  $8 = $36;
  $37 = $3;
  $38 = $8;
  _fus_printer_write_long_int($37,$38);
  STACKTOP = sp;return;
 }
 $39 = $35 & 3;
 $40 = ($39|0)==(2);
 if ($40) {
  $41 = HEAP32[$2>>2]|0;
  $42 = $41 >> 2;
  $9 = $42;
  $43 = $4;
  $44 = ((($43)) + 4|0);
  $45 = HEAP32[$44>>2]|0;
  $46 = $9;
  $47 = (_fus_symtable_get_entry($45,$46)|0);
  $10 = $47;
  $48 = $10;
  $49 = ((($48)) + 12|0);
  $50 = HEAP8[$49>>0]|0;
  $51 = $50&1;
  $52 = $3;
  if ($51) {
   _fus_printer_write_char($52,96);
   $53 = $3;
   $54 = $10;
   $55 = ((($54)) + 8|0);
   $56 = HEAP32[$55>>2]|0;
   _fus_printer_write_text($53,$56);
   STACKTOP = sp;return;
  } else {
   _fus_printer_write_text($52,1784);
   $57 = $3;
   $58 = $10;
   $59 = ((($58)) + 8|0);
   $60 = HEAP32[$59>>2]|0;
   _fus_printer_write_text($57,$60);
   $61 = $3;
   _fus_printer_write_text($61,5473);
   STACKTOP = sp;return;
  }
 } else {
  $62 = HEAP32[$2>>2]|0;
  $63 = ($62|0)==(0|0);
  if ($63) {
   $64 = $3;
   _fus_printer_write_text($64,1788);
   STACKTOP = sp;return;
  } else {
   $65 = $11;
   $11 = $65;
   ;HEAP32[$12>>2]=HEAP32[$12>>2]|0;
   $66 = HEAP32[54]|0;
   HEAP32[$vararg_buffer>>2] = 1824;
   (_fprintf($66,1792,$vararg_buffer)|0);
   $67 = $11;
   $68 = HEAP32[54]|0;
   ;HEAP32[$$byval_copy>>2]=HEAP32[$12>>2]|0;
   _fus_value_fprint($67,$$byval_copy,$68);
   $69 = HEAP32[54]|0;
   (_fprintf($69,3141,$vararg_buffer1)|0);
   $70 = $3;
   _fus_printer_write_text($70,1848);
   STACKTOP = sp;return;
  }
 }
}
function _fus_printer_write_boxed($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0;
 var $29 = 0, $3 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $4 = 0, $40 = 0, $41 = 0, $42 = 0, $43 = 0, $44 = 0, $45 = 0, $46 = 0;
 var $47 = 0, $48 = 0, $49 = 0, $5 = 0, $50 = 0, $51 = 0, $52 = 0, $53 = 0, $54 = 0, $55 = 0, $56 = 0, $57 = 0, $58 = 0, $59 = 0, $6 = 0, $60 = 0, $61 = 0, $62 = 0, $63 = 0, $64 = 0;
 var $65 = 0, $66 = 0, $67 = 0, $68 = 0, $69 = 0, $7 = 0, $70 = 0, $71 = 0, $72 = 0, $73 = 0, $74 = 0, $75 = 0, $76 = 0, $77 = 0, $78 = 0, $79 = 0, $8 = 0, $80 = 0, $81 = 0, $82 = 0;
 var $83 = 0, $84 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 32|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(32|0);
 $2 = $0;
 $3 = $1;
 $9 = $3;
 $10 = ((($9)) + 4|0);
 $11 = HEAP32[$10>>2]|0;
 $4 = $11;
 $12 = $4;
 $13 = ($12|0)==(0);
 if ($13) {
  $14 = $2;
  _fus_printer_write_text($14,5047);
  $15 = $3;
  $16 = ((($15)) + 12|0);
  $5 = $16;
  $17 = $5;
  $18 = ((($17)) + 8|0);
  $19 = HEAP32[$18>>2]|0;
  $20 = ($19|0)>(0);
  if (!($20)) {
   STACKTOP = sp;return;
  }
  $21 = $2;
  $22 = ((($21)) + 4116|0);
  $23 = HEAP8[$22>>0]|0;
  $24 = $23&1;
  $25 = $2;
  if ($24) {
   _fus_printer_write_text($25,1876);
   STACKTOP = sp;return;
  } else {
   $26 = ((($25)) + 4120|0);
   $27 = HEAP32[$26>>2]|0;
   $28 = (($27) + 1)|0;
   HEAP32[$26>>2] = $28;
   $29 = $2;
   _fus_printer_write_newline($29);
   $30 = $2;
   $31 = $3;
   $32 = HEAP32[$31>>2]|0;
   $33 = $5;
   _fus_printer_write_arr($30,$32,$33);
   $34 = $2;
   $35 = ((($34)) + 4120|0);
   $36 = HEAP32[$35>>2]|0;
   $37 = (($36) + -1)|0;
   HEAP32[$35>>2] = $37;
   STACKTOP = sp;return;
  }
 }
 $38 = $4;
 $39 = ($38|0)==(1);
 if ($39) {
  $40 = $2;
  _fus_printer_write_text($40,5309);
  $41 = $3;
  $42 = ((($41)) + 12|0);
  $6 = $42;
  $43 = $6;
  $44 = ((($43)) + 8|0);
  $45 = HEAP32[$44>>2]|0;
  $46 = ($45|0)>(0);
  if (!($46)) {
   STACKTOP = sp;return;
  }
  $47 = $2;
  $48 = ((($47)) + 4116|0);
  $49 = HEAP8[$48>>0]|0;
  $50 = $49&1;
  $51 = $2;
  if ($50) {
   _fus_printer_write_text($51,1876);
   STACKTOP = sp;return;
  } else {
   $52 = ((($51)) + 4120|0);
   $53 = HEAP32[$52>>2]|0;
   $54 = (($53) + 1)|0;
   HEAP32[$52>>2] = $54;
   $55 = $2;
   _fus_printer_write_newline($55);
   $56 = $2;
   $57 = $3;
   $58 = HEAP32[$57>>2]|0;
   $59 = $6;
   _fus_printer_write_obj($56,$58,$59);
   $60 = $2;
   $61 = ((($60)) + 4120|0);
   $62 = HEAP32[$61>>2]|0;
   $63 = (($62) + -1)|0;
   HEAP32[$61>>2] = $63;
   STACKTOP = sp;return;
  }
 }
 $64 = $4;
 $65 = ($64|0)==(2);
 if ($65) {
  $66 = $3;
  $67 = ((($66)) + 12|0);
  $7 = $67;
  $68 = $2;
  $69 = $7;
  _fus_printer_write_str($68,$69);
  STACKTOP = sp;return;
 }
 $70 = $4;
 $71 = ($70|0)==(3);
 if (!($71)) {
  $84 = $2;
  _fus_printer_write_text($84,1883);
  STACKTOP = sp;return;
 }
 $72 = $3;
 $73 = ((($72)) + 12|0);
 $8 = $73;
 $74 = $8;
 $75 = HEAP32[$74>>2]|0;
 $76 = ($75|0)!=(0|0);
 $77 = $2;
 if ($76) {
  _fus_printer_write_text($77,1881);
  $78 = $2;
  $79 = $8;
  $80 = HEAP32[$79>>2]|0;
  _fus_printer_write_text($78,$80);
  STACKTOP = sp;return;
 } else {
  $81 = $3;
  $82 = HEAP32[$81>>2]|0;
  $83 = $8;
  _fus_printer_write_fun($77,$82,$83);
  STACKTOP = sp;return;
 }
}
function _fus_printer_write_arr($0,$1,$2) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 var $$byval_copy = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0;
 var $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 32|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(32|0);
 $$byval_copy = sp + 24|0;
 $3 = $0;
 $4 = $1;
 $5 = $2;
 $9 = $5;
 $10 = ((($9)) + 8|0);
 $11 = HEAP32[$10>>2]|0;
 $6 = $11;
 $12 = $5;
 $13 = ((($12)) + 4|0);
 $14 = HEAP32[$13>>2]|0;
 $7 = $14;
 $8 = 0;
 while(1) {
  $15 = $8;
  $16 = $6;
  $17 = ($15|0)<($16|0);
  if (!($17)) {
   break;
  }
  $18 = $8;
  $19 = ($18|0)>(0);
  if ($19) {
   $20 = $3;
   _fus_printer_write_newline($20);
  }
  $21 = $3;
  $22 = $4;
  $23 = $7;
  $24 = $8;
  $25 = (($23) + ($24<<2)|0);
  ;HEAP32[$$byval_copy>>2]=HEAP32[$25>>2]|0;
  _fus_printer_write_value($21,$22,$$byval_copy);
  $26 = $3;
  _fus_printer_write_text($26,1981);
  $27 = $8;
  $28 = (($27) + 1)|0;
  $8 = $28;
 }
 STACKTOP = sp;return;
}
function _fus_printer_write_obj($0,$1,$2) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 var $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $3 = $0;
 $4 = $1;
 $5 = $2;
 $6 = $3;
 $7 = $4;
 $8 = $5;
 __fus_printer_write_obj($6,$7,$8,0);
 STACKTOP = sp;return;
}
function _fus_printer_write_str($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0;
 var $29 = 0, $3 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 32|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(32|0);
 $2 = $0;
 $3 = $1;
 $8 = $2;
 _fus_printer_write_text($8,1968);
 $9 = $3;
 $10 = HEAP32[$9>>2]|0;
 $4 = $10;
 $11 = $3;
 $12 = ((($11)) + 4|0);
 $13 = HEAP32[$12>>2]|0;
 $5 = $13;
 $6 = 0;
 while(1) {
  $14 = $6;
  $15 = $5;
  $16 = ($14|0)<($15|0);
  if (!($16)) {
   break;
  }
  $17 = $4;
  $18 = $6;
  $19 = (($17) + ($18)|0);
  $20 = HEAP8[$19>>0]|0;
  $7 = $20;
  $21 = $7;
  $22 = $21 << 24 >> 24;
  $23 = ($22|0)==(10);
  do {
   if ($23) {
    $24 = $2;
    _fus_printer_write_text($24,1970);
   } else {
    $25 = $7;
    $26 = $25 << 24 >> 24;
    $27 = ($26|0)==(34);
    if ($27) {
     $28 = $2;
     _fus_printer_write_text($28,1973);
     break;
    }
    $29 = $7;
    $30 = $29 << 24 >> 24;
    $31 = (_strchr(1976,$30)|0);
    $32 = ($31|0)!=(0|0);
    $33 = $2;
    if ($32) {
     _fus_printer_write_text($33,1979);
     $34 = $2;
     $35 = $7;
     _fus_printer_write_char($34,$35);
     break;
    } else {
     $36 = $7;
     _fus_printer_write_char($33,$36);
     break;
    }
   }
  } while(0);
  $37 = $6;
  $38 = (($37) + 1)|0;
  $6 = $38;
 }
 $39 = $2;
 _fus_printer_write_text($39,1968);
 STACKTOP = sp;return;
}
function _fus_printer_write_fun($0,$1,$2) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 var $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0, $29 = 0;
 var $3 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $4 = 0, $40 = 0, $41 = 0, $42 = 0, $43 = 0, $44 = 0, $5 = 0, $6 = 0, $7 = 0;
 var $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 32|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(32|0);
 $3 = $0;
 $4 = $1;
 $5 = $2;
 $8 = $5;
 $9 = ((($8)) + 4|0);
 $6 = $9;
 $10 = $3;
 _fus_printer_write_text($10,2089);
 $11 = $5;
 $12 = ((($11)) + 36|0);
 $13 = HEAP8[$12>>0]|0;
 $14 = $13&1;
 if ($14) {
  $15 = $5;
  $16 = ((($15)) + 20|0);
  $7 = $16;
  $17 = $3;
  _fus_printer_write_text($17,1915);
  $18 = $3;
  _fus_printer_set_style_inline($18);
  $19 = $3;
  $20 = $4;
  $21 = $7;
  _fus_printer_write_data($19,$20,$21,0,-1);
  $22 = $3;
  _fus_printer_set_style_full($22);
  $23 = $3;
  _fus_printer_write_text($23,5473);
 }
 $24 = $6;
 $25 = ((($24)) + 8|0);
 $26 = HEAP32[$25>>2]|0;
 $27 = ($26|0)>(0);
 $28 = $3;
 if (!($27)) {
  _fus_printer_write_text($28,1922);
  STACKTOP = sp;return;
 }
 _fus_printer_write_text($28,1920);
 $29 = $3;
 $30 = ((($29)) + 4116|0);
 $31 = HEAP8[$30>>0]|0;
 $32 = $31&1;
 $33 = $3;
 if ($32) {
  _fus_printer_write_text($33,1876);
  STACKTOP = sp;return;
 } else {
  $34 = ((($33)) + 4120|0);
  $35 = HEAP32[$34>>2]|0;
  $36 = (($35) + 1)|0;
  HEAP32[$34>>2] = $36;
  $37 = $3;
  _fus_printer_write_newline($37);
  $38 = $3;
  $39 = $4;
  $40 = $6;
  _fus_printer_write_data($38,$39,$40,0,-1);
  $41 = $3;
  $42 = ((($41)) + 4120|0);
  $43 = HEAP32[$42>>2]|0;
  $44 = (($43) + -1)|0;
  HEAP32[$42>>2] = $44;
  STACKTOP = sp;return;
 }
}
function _fus_printer_write_data($0,$1,$2,$3,$4) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 $3 = $3|0;
 $4 = $4|0;
 var $$byval_copy = 0, $10 = 0, $100 = 0, $101 = 0, $102 = 0, $103 = 0, $104 = 0, $105 = 0, $106 = 0, $107 = 0, $108 = 0, $109 = 0, $11 = 0, $110 = 0, $111 = 0, $112 = 0, $113 = 0, $114 = 0, $115 = 0, $12 = 0;
 var $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0, $29 = 0, $30 = 0, $31 = 0, $32 = 0;
 var $33 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $40 = 0, $41 = 0, $42 = 0, $43 = 0, $44 = 0, $45 = 0, $46 = 0, $47 = 0, $48 = 0, $49 = 0, $5 = 0, $50 = 0, $51 = 0;
 var $52 = 0, $53 = 0, $54 = 0, $55 = 0, $56 = 0, $57 = 0, $58 = 0, $59 = 0, $6 = 0, $60 = 0, $61 = 0, $62 = 0, $63 = 0, $64 = 0, $65 = 0, $66 = 0, $67 = 0, $68 = 0, $69 = 0, $7 = 0;
 var $70 = 0, $71 = 0, $72 = 0, $73 = 0, $74 = 0, $75 = 0, $76 = 0, $77 = 0, $78 = 0, $79 = 0, $8 = 0, $80 = 0, $81 = 0, $82 = 0, $83 = 0, $84 = 0, $85 = 0, $86 = 0, $87 = 0, $88 = 0;
 var $89 = 0, $9 = 0, $90 = 0, $91 = 0, $92 = 0, $93 = 0, $94 = 0, $95 = 0, $96 = 0, $97 = 0, $98 = 0, $99 = 0, $vararg_buffer = 0, $vararg_buffer1 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 80|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(80|0);
 $$byval_copy = sp + 76|0;
 $vararg_buffer1 = sp + 8|0;
 $vararg_buffer = sp;
 $13 = sp + 40|0;
 $20 = sp + 12|0;
 $5 = $0;
 $6 = $1;
 $7 = $2;
 $8 = $3;
 $9 = $4;
 $21 = $7;
 $22 = ((($21)) + 8|0);
 $23 = HEAP32[$22>>2]|0;
 $10 = $23;
 $24 = $7;
 $25 = ((($24)) + 4|0);
 $26 = HEAP32[$25>>2]|0;
 $11 = $26;
 $27 = $9;
 $28 = ($27|0)<(0);
 if ($28) {
  label = 3;
 } else {
  $29 = $9;
  $30 = $10;
  $31 = ($29|0)>($30|0);
  if ($31) {
   label = 3;
  }
 }
 if ((label|0) == 3) {
  $32 = $10;
  $9 = $32;
 }
 $33 = $8;
 $12 = $33;
 while(1) {
  $34 = $12;
  $35 = $9;
  $36 = ($34|0)<($35|0);
  if (!($36)) {
   break;
  }
  $37 = $12;
  $38 = ($37|0)!=(0);
  if ($38) {
   $39 = $5;
   _fus_printer_write_newline($39);
  }
  $40 = $11;
  $41 = $12;
  $42 = (($40) + ($41<<2)|0);
  ;HEAP32[$13>>2]=HEAP32[$42>>2]|0;
  $43 = HEAP32[$13>>2]|0;
  $44 = $43 & 3;
  $45 = ($44|0)==(1);
  $46 = HEAP32[$13>>2]|0;
  do {
   if ($45) {
    $47 = $46 >> 2;
    $14 = $47;
    $48 = $5;
    $49 = $14;
    _fus_printer_write_long_int($48,$49);
   } else {
    $50 = $46 & 3;
    $51 = ($50|0)==(2);
    $52 = HEAP32[$13>>2]|0;
    if ($51) {
     $53 = $52 >> 2;
     $15 = $53;
     $54 = $6;
     $55 = ((($54)) + 4|0);
     $56 = HEAP32[$55>>2]|0;
     $57 = $15;
     $58 = (_fus_symtable_get_entry($56,$57)|0);
     $16 = $58;
     $59 = $5;
     $60 = $16;
     $61 = ((($60)) + 8|0);
     $62 = HEAP32[$61>>2]|0;
     _fus_printer_write_text($59,$62);
     break;
    }
    $63 = $52 & 3;
    $64 = ($63|0)==(0);
    if ($64) {
     $65 = HEAP32[$13>>2]|0;
     $66 = ($65|0)!=(0|0);
     if ($66) {
      $67 = HEAP32[$13>>2]|0;
      $17 = $67;
      $68 = $17;
      $69 = ((($68)) + 4|0);
      $70 = HEAP32[$69>>2]|0;
      $18 = $70;
      $71 = $18;
      $72 = ($71|0)==(0);
      if ($72) {
       $73 = $5;
       _fus_printer_write_text($73,1920);
       $74 = $5;
       $75 = ((($74)) + 4117|0);
       $76 = HEAP8[$75>>0]|0;
       $77 = $76&1;
       $78 = $5;
       if ($77) {
        _fus_printer_write_text($78,1876);
        break;
       } else {
        $79 = ((($78)) + 4120|0);
        $80 = HEAP32[$79>>2]|0;
        $81 = (($80) + 1)|0;
        HEAP32[$79>>2] = $81;
        $82 = $5;
        _fus_printer_write_newline($82);
        $83 = $5;
        $84 = $6;
        $85 = $17;
        $86 = ((($85)) + 12|0);
        _fus_printer_write_data($83,$84,$86,0,-1);
        $87 = $5;
        $88 = ((($87)) + 4120|0);
        $89 = HEAP32[$88>>2]|0;
        $90 = (($89) + -1)|0;
        HEAP32[$88>>2] = $90;
        break;
       }
      }
      $91 = $18;
      $92 = ($91|0)==(2);
      if ($92) {
       $93 = $5;
       $94 = $17;
       $95 = ((($94)) + 12|0);
       _fus_printer_write_str($93,$95);
       break;
      }
      $96 = $18;
      $97 = ($96|0)==(1);
      if ($97) {
       $98 = $5;
       $99 = $6;
       $100 = $17;
       $101 = ((($100)) + 12|0);
       _fus_printer_write_obj_as_data($98,$99,$101);
       break;
      }
      $102 = $18;
      $103 = ($102|0)==(3);
      $104 = $5;
      if ($103) {
       $105 = $6;
       $106 = $17;
       $107 = ((($106)) + 12|0);
       _fus_printer_write_fun($104,$105,$107);
       break;
      } else {
       _fus_printer_write_text($104,1925);
       break;
      }
     }
    }
    $108 = $19;
    $19 = $108;
    ;HEAP32[$20>>2]=HEAP32[$20>>2]|0;
    $109 = HEAP32[54]|0;
    HEAP32[$vararg_buffer>>2] = 1938;
    (_fprintf($109,1792,$vararg_buffer)|0);
    $110 = $19;
    $111 = HEAP32[54]|0;
    ;HEAP32[$$byval_copy>>2]=HEAP32[$20>>2]|0;
    _fus_value_fprint($110,$$byval_copy,$111);
    $112 = HEAP32[54]|0;
    (_fprintf($112,3141,$vararg_buffer1)|0);
    $113 = $5;
    _fus_printer_write_text($113,1925);
   }
  } while(0);
  $114 = $12;
  $115 = (($114) + 1)|0;
  $12 = $115;
 }
 STACKTOP = sp;return;
}
function _fus_printer_write_obj_as_data($0,$1,$2) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 var $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $3 = $0;
 $4 = $1;
 $5 = $2;
 $6 = $3;
 $7 = $4;
 $8 = $5;
 __fus_printer_write_obj($6,$7,$8,1);
 STACKTOP = sp;return;
}
function __fus_printer_write_obj($0,$1,$2,$3) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 $3 = $3|0;
 var $$byval_copy = 0, $$byval_copy1 = 0, $$byval_copy2 = 0, $$byval_copy3 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0;
 var $26 = 0, $27 = 0, $28 = 0, $29 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $4 = 0, $40 = 0, $41 = 0, $42 = 0, $43 = 0, $44 = 0;
 var $45 = 0, $46 = 0, $47 = 0, $48 = 0, $49 = 0, $5 = 0, $50 = 0, $51 = 0, $52 = 0, $53 = 0, $54 = 0, $55 = 0, $56 = 0, $57 = 0, $58 = 0, $59 = 0, $6 = 0, $60 = 0, $61 = 0, $62 = 0;
 var $63 = 0, $64 = 0, $65 = 0, $66 = 0, $67 = 0, $68 = 0, $69 = 0, $7 = 0, $70 = 0, $71 = 0, $72 = 0, $73 = 0, $74 = 0, $75 = 0, $76 = 0, $77 = 0, $78 = 0, $79 = 0, $8 = 0, $80 = 0;
 var $81 = 0, $82 = 0, $83 = 0, $84 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 64|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(64|0);
 $$byval_copy3 = sp + 52|0;
 $$byval_copy2 = sp + 48|0;
 $$byval_copy1 = sp + 44|0;
 $$byval_copy = sp + 40|0;
 $14 = sp;
 $4 = $0;
 $5 = $1;
 $6 = $2;
 $16 = $3&1;
 $7 = $16;
 $17 = $5;
 $18 = ((($17)) + 4|0);
 $19 = HEAP32[$18>>2]|0;
 $8 = $19;
 $20 = $6;
 $21 = ((($20)) + 8|0);
 $22 = HEAP32[$21>>2]|0;
 $9 = $22;
 $23 = $6;
 $24 = ((($23)) + 4|0);
 $25 = HEAP32[$24>>2]|0;
 $26 = $6;
 $27 = HEAP32[$26>>2]|0;
 $28 = ((($27)) + 8|0);
 $29 = HEAP32[$28>>2]|0;
 $30 = 0;
 $31 = (($25) + ($30)|0);
 $10 = $31;
 $32 = $6;
 $33 = ((($32)) + 16|0);
 $34 = ((($33)) + 4|0);
 $35 = HEAP32[$34>>2]|0;
 $11 = $35;
 $12 = 0;
 while(1) {
  $36 = $12;
  $37 = $9;
  $38 = ($36|0)<($37|0);
  if (!($38)) {
   break;
  }
  $39 = $8;
  $40 = $10;
  $41 = $12;
  $42 = (($40) + ($41<<2)|0);
  $43 = HEAP32[$42>>2]|0;
  $44 = (_fus_symtable_get_token($39,$43)|0);
  $13 = $44;
  $45 = $11;
  $46 = $12;
  $47 = (($45) + ($46<<2)|0);
  ;HEAP32[$14>>2]=HEAP32[$47>>2]|0;
  $48 = $12;
  $49 = ($48|0)>(0);
  if ($49) {
   $50 = $4;
   _fus_printer_write_newline($50);
  }
  $51 = $7;
  $52 = $51&1;
  $53 = $4;
  if ($52) {
   $54 = $13;
   _fus_printer_write_text($53,$54);
   $55 = $4;
   _fus_printer_write_text($55,1961);
   $15 = 0;
   $56 = $15;
   $57 = $56&1;
   if ($57) {
    $58 = $4;
    $59 = ((($58)) + 4120|0);
    $60 = HEAP32[$59>>2]|0;
    $61 = (($60) + 1)|0;
    HEAP32[$59>>2] = $61;
    $62 = $4;
    _fus_printer_write_newline($62);
   }
   ;HEAP32[$$byval_copy>>2]=HEAP32[$14>>2]|0;
   $63 = (_fus_value_is_arr($$byval_copy)|0);
   do {
    if ($63) {
     $64 = $4;
     $65 = $5;
     $66 = HEAP32[$14>>2]|0;
     $67 = ((($66)) + 12|0);
     _fus_printer_write_data($64,$65,$67,0,-1);
    } else {
     ;HEAP32[$$byval_copy1>>2]=HEAP32[$14>>2]|0;
     $68 = (_fus_value_is_obj($$byval_copy1)|0);
     $69 = $4;
     $70 = $5;
     if ($68) {
      $71 = HEAP32[$14>>2]|0;
      $72 = ((($71)) + 12|0);
      _fus_printer_write_obj_as_data($69,$70,$72);
      break;
     } else {
      ;HEAP32[$$byval_copy2>>2]=HEAP32[$14>>2]|0;
      _fus_printer_write_value($69,$70,$$byval_copy2);
      break;
     }
    }
   } while(0);
   $73 = $15;
   $74 = $73&1;
   if ($74) {
    $75 = $4;
    $76 = ((($75)) + 4120|0);
    $77 = HEAP32[$76>>2]|0;
    $78 = (($77) + -1)|0;
    HEAP32[$76>>2] = $78;
   }
  } else {
   $79 = $5;
   ;HEAP32[$$byval_copy3>>2]=HEAP32[$14>>2]|0;
   _fus_printer_write_value($53,$79,$$byval_copy3);
   $80 = $4;
   _fus_printer_write_text($80,1964);
   $81 = $4;
   $82 = $13;
   _fus_printer_write_text($81,$82);
  }
  $83 = $12;
  $84 = (($83) + 1)|0;
  $12 = $84;
 }
 STACKTOP = sp;return;
}
function _fus_printer_print_arr($0,$1,$2) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 var $10 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $3 = $0;
 $4 = $1;
 $5 = $2;
 $6 = $3;
 $7 = $4;
 $8 = $5;
 _fus_printer_write_arr($6,$7,$8);
 $9 = $3;
 $10 = (_fus_printer_flush($9)|0);
 STACKTOP = sp;return ($10|0);
}
function _fus_printer_print_obj($0,$1,$2) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 var $10 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $3 = $0;
 $4 = $1;
 $5 = $2;
 $6 = $3;
 $7 = $4;
 $8 = $5;
 _fus_printer_write_obj($6,$7,$8);
 $9 = $3;
 $10 = (_fus_printer_flush($9)|0);
 STACKTOP = sp;return ($10|0);
}
function _fus_printer_print_data($0,$1,$2,$3,$4) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 $3 = $3|0;
 $4 = $4|0;
 var $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 32|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(32|0);
 $5 = $0;
 $6 = $1;
 $7 = $2;
 $8 = $3;
 $9 = $4;
 $10 = $5;
 $11 = $6;
 $12 = $7;
 $13 = $8;
 $14 = $9;
 _fus_printer_write_data($10,$11,$12,$13,$14);
 $15 = $5;
 $16 = (_fus_printer_flush($15)|0);
 STACKTOP = sp;return ($16|0);
}
function _fus_printer_print_value($0,$1,$2) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 var $$byval_copy = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $$byval_copy = sp + 8|0;
 $3 = $0;
 $4 = $1;
 $5 = $3;
 $6 = $4;
 ;HEAP32[$$byval_copy>>2]=HEAP32[$2>>2]|0;
 _fus_printer_write_value($5,$6,$$byval_copy);
 $7 = $3;
 $8 = (_fus_printer_flush($7)|0);
 STACKTOP = sp;return ($8|0);
}
function _fus_runner_get_callframe($0) {
 $0 = $0|0;
 var $1 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0;
 var $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $2 = $0;
 $4 = $2;
 $5 = ((($4)) + 36|0);
 $6 = ((($5)) + 8|0);
 $7 = HEAP32[$6>>2]|0;
 $3 = $7;
 $8 = $3;
 $9 = ($8|0)<(1);
 if ($9) {
  $1 = 0;
  $23 = $1;
  STACKTOP = sp;return ($23|0);
 } else {
  $10 = $2;
  $11 = ((($10)) + 36|0);
  $12 = ((($11)) + 4|0);
  $13 = HEAP32[$12>>2]|0;
  $14 = $3;
  $15 = (($14) - 1)|0;
  $16 = $2;
  $17 = ((($16)) + 36|0);
  $18 = HEAP32[$17>>2]|0;
  $19 = ((($18)) + 8|0);
  $20 = HEAP32[$19>>2]|0;
  $21 = Math_imul($15, $20)|0;
  $22 = (($13) + ($21)|0);
  $1 = $22;
  $23 = $1;
  STACKTOP = sp;return ($23|0);
 }
 return (0)|0;
}
function _fus_runner_push_callframe($0,$1,$2) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 var $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $3 = $0;
 $4 = $1;
 $5 = $2;
 $7 = $3;
 $8 = ((($7)) + 36|0);
 _fus_array_push($8);
 $9 = $3;
 $10 = (_fus_runner_get_callframe($9)|0);
 $6 = $10;
 $11 = $6;
 $12 = $3;
 $13 = $4;
 $14 = $5;
 _fus_runner_callframe_init($11,$12,$13,$14);
 STACKTOP = sp;return;
}
function _fus_runner_callframe_cleanup($0) {
 $0 = $0|0;
 var $1 = 0, $10 = 0, $11 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $1 = $0;
 $2 = $1;
 $3 = HEAP32[$2>>2]|0;
 $4 = HEAP32[$3>>2]|0;
 $5 = $1;
 $6 = ((($5)) + 24|0);
 _fus_arr_cleanup($4,$6);
 $7 = $1;
 $8 = HEAP32[$7>>2]|0;
 $9 = HEAP32[$8>>2]|0;
 $10 = $1;
 $11 = ((($10)) + 40|0);
 _fus_obj_cleanup($9,$11);
 STACKTOP = sp;return;
}
function _fus_runner_callframe_init($0,$1,$2,$3) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 $3 = $3|0;
 var $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0, $29 = 0;
 var $30 = 0, $31 = 0, $32 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $4 = $0;
 $5 = $1;
 $6 = $2;
 $7 = $3;
 $8 = $5;
 $9 = $4;
 HEAP32[$9>>2] = $8;
 $10 = $6;
 $11 = $4;
 $12 = ((($11)) + 4|0);
 HEAP32[$12>>2] = $10;
 $13 = $6;
 $14 = (_fus_runner_callframe_type_inherits($13)|0);
 $15 = $4;
 $16 = ((($15)) + 8|0);
 $17 = $14&1;
 HEAP8[$16>>0] = $17;
 $18 = $4;
 $19 = ((($18)) + 12|0);
 HEAP32[$19>>2] = 0;
 $20 = $7;
 $21 = $4;
 $22 = ((($21)) + 16|0);
 HEAP32[$22>>2] = $20;
 $23 = $4;
 $24 = ((($23)) + 20|0);
 HEAP32[$24>>2] = 0;
 $25 = $5;
 $26 = HEAP32[$25>>2]|0;
 $27 = $4;
 $28 = ((($27)) + 24|0);
 _fus_arr_init($26,$28);
 $29 = $5;
 $30 = HEAP32[$29>>2]|0;
 $31 = $4;
 $32 = ((($31)) + 40|0);
 _fus_obj_init($30,$32);
 STACKTOP = sp;return;
}
function _fus_runner_callframe_type_inherits($0) {
 $0 = $0|0;
 var $1 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $1 = $0;
 $2 = $1;
 $3 = (1984 + ($2)|0);
 $4 = HEAP8[$3>>0]|0;
 $5 = $4&1;
 STACKTOP = sp;return ($5|0);
}
function _fus_runner_init($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $2 = $0;
 $3 = $1;
 $4 = $3;
 $5 = $2;
 HEAP32[$5>>2] = $4;
 $6 = $3;
 $7 = $2;
 $8 = ((($7)) + 4|0);
 _fus_obj_init($6,$8);
 $9 = $2;
 $10 = ((($9)) + 208|0);
 $11 = $3;
 $12 = HEAP32[$11>>2]|0;
 $13 = $2;
 _fus_class_init($10,$12,1989,72,$13,5,8);
 $14 = $2;
 $15 = ((($14)) + 36|0);
 $16 = $2;
 $17 = ((($16)) + 208|0);
 _fus_array_init($15,$17);
 $18 = $2;
 _fus_runner_push_callframe($18,0,0);
 STACKTOP = sp;return;
}
function _fus_class_cleanup_runner_callframe($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $2 = $0;
 $3 = $1;
 $5 = $3;
 $4 = $5;
 $6 = $4;
 _fus_runner_callframe_cleanup($6);
 STACKTOP = sp;return;
}
function _fus_runner_cleanup($0) {
 $0 = $0|0;
 var $1 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $1 = $0;
 $2 = $1;
 $3 = HEAP32[$2>>2]|0;
 $4 = $1;
 $5 = ((($4)) + 4|0);
 _fus_obj_cleanup($3,$5);
 $6 = $1;
 $7 = ((($6)) + 36|0);
 _fus_array_cleanup($7);
 STACKTOP = sp;return;
}
function _fus_str_init($0,$1,$2,$3,$4) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 $3 = $3|0;
 $4 = $4|0;
 var $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 32|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(32|0);
 $5 = $0;
 $6 = $1;
 $7 = $2;
 $8 = $3;
 $9 = $4;
 $10 = $7;
 $11 = $6;
 HEAP32[$11>>2] = $10;
 $12 = $8;
 $13 = $6;
 $14 = ((($13)) + 4|0);
 HEAP32[$14>>2] = $12;
 $15 = $9;
 $16 = $6;
 $17 = ((($16)) + 8|0);
 HEAP32[$17>>2] = $15;
 STACKTOP = sp;return;
}
function _fus_str_cleanup($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $2 = $0;
 $3 = $1;
 $4 = $3;
 $5 = ((($4)) + 8|0);
 $6 = HEAP32[$5>>2]|0;
 $7 = ($6|0)!=(0);
 if (!($7)) {
  STACKTOP = sp;return;
 }
 $8 = $3;
 $9 = HEAP32[$8>>2]|0;
 _free($9);
 STACKTOP = sp;return;
}
function _fus_str_len($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $2 = $0;
 $3 = $1;
 $4 = $3;
 $5 = ((($4)) + 4|0);
 $6 = HEAP32[$5>>2]|0;
 STACKTOP = sp;return ($6|0);
}
function _fus_value_str($0,$1,$2,$3,$4) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 $3 = $3|0;
 $4 = $4|0;
 var $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $20 = 0, $21 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 32|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(32|0);
 $5 = $1;
 $6 = $2;
 $7 = $3;
 $8 = $4;
 $10 = $5;
 $11 = HEAP32[$10>>2]|0;
 $12 = (_fus_malloc($11,68)|0);
 $9 = $12;
 $13 = $9;
 $14 = $5;
 _fus_boxed_init($13,$14,2);
 $15 = $5;
 $16 = $9;
 $17 = ((($16)) + 12|0);
 $18 = $6;
 $19 = $7;
 $20 = $8;
 _fus_str_init($15,$17,$18,$19,$20);
 $21 = $9;
 HEAP32[$0>>2] = $21;
 STACKTOP = sp;return;
}
function _fus_value_str_len($0,$1,$2) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 var $$byval_copy = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $$byval_copy = sp + 4|0;
 $3 = $1;
 ;HEAP32[$$byval_copy>>2]=HEAP32[$2>>2]|0;
 $4 = (_fus_value_is_str($$byval_copy)|0);
 $5 = $3;
 if ($4) {
  $6 = $3;
  $7 = HEAP32[$2>>2]|0;
  $8 = ((($7)) + 12|0);
  $9 = (_fus_str_len($6,$8)|0);
  _fus_value_int($0,$5,$9);
  STACKTOP = sp;return;
 } else {
  _fus_value_err($0,$5,0);
  STACKTOP = sp;return;
 }
}
function _fus_value_str_decode($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $$byval_copy = 0, $10 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, $vararg_buffer = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $$byval_copy = sp + 12|0;
 $vararg_buffer = sp;
 $3 = $0;
 ;HEAP32[$$byval_copy>>2]=HEAP32[$1>>2]|0;
 $4 = (_fus_value_is_str($$byval_copy)|0);
 if ($4) {
  $7 = HEAP32[$1>>2]|0;
  $8 = ((($7)) + 12|0);
  $9 = HEAP32[$8>>2]|0;
  $2 = $9;
  $10 = $2;
  STACKTOP = sp;return ($10|0);
 } else {
  $5 = HEAP32[54]|0;
  $6 = HEAP32[$1>>2]|0;
  HEAP32[$vararg_buffer>>2] = $6;
  (_fprintf($5,2006,$vararg_buffer)|0);
  $2 = 0;
  $10 = $2;
  STACKTOP = sp;return ($10|0);
 }
 return (0)|0;
}
function _fus_symtable_entry_init_zero($0) {
 $0 = $0|0;
 var $1 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $1 = $0;
 $2 = $1;
 HEAP32[$2>>2] = 0;
 $3 = $1;
 $4 = ((($3)) + 8|0);
 HEAP32[$4>>2] = 0;
 $5 = $1;
 $6 = ((($5)) + 4|0);
 HEAP32[$6>>2] = 0;
 $7 = $1;
 $8 = ((($7)) + 12|0);
 HEAP8[$8>>0] = 0;
 STACKTOP = sp;return;
}
function _fus_symtable_entry_init($0,$1,$2,$3) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 $3 = $3|0;
 var $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0, $29 = 0;
 var $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $4 = $0;
 $5 = $1;
 $6 = $2;
 $7 = $3;
 $8 = $5;
 $9 = $4;
 HEAP32[$9>>2] = $8;
 $10 = $5;
 $11 = HEAP32[$10>>2]|0;
 $12 = $6;
 $13 = $7;
 $14 = (_fus_strndup($11,$12,$13)|0);
 $15 = $4;
 $16 = ((($15)) + 8|0);
 HEAP32[$16>>2] = $14;
 $17 = $7;
 $18 = $4;
 $19 = ((($18)) + 4|0);
 HEAP32[$19>>2] = $17;
 $20 = $7;
 $21 = ($20|0)>(0);
 if ($21) {
  $22 = $6;
  $23 = HEAP8[$22>>0]|0;
  $24 = $23 << 24 >> 24;
  $25 = ($24|0)==(95);
  if ($25) {
   $34 = 1;
  } else {
   $26 = $6;
   $27 = HEAP8[$26>>0]|0;
   $28 = $27 << 24 >> 24;
   $29 = (_isalpha($28)|0);
   $30 = ($29|0)!=(0);
   $34 = $30;
  }
 } else {
  $34 = 0;
 }
 $31 = $4;
 $32 = ((($31)) + 12|0);
 $33 = $34&1;
 HEAP8[$32>>0] = $33;
 STACKTOP = sp;return;
}
function _fus_symtable_entry_cleanup($0) {
 $0 = $0|0;
 var $1 = 0, $2 = 0, $3 = 0, $4 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $1 = $0;
 $2 = $1;
 $3 = ((($2)) + 8|0);
 $4 = HEAP32[$3>>2]|0;
 _free($4);
 STACKTOP = sp;return;
}
function _fus_symtable_init($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $10 = 0, $11 = 0, $12 = 0, $13 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $2 = $0;
 $3 = $1;
 $4 = $3;
 $5 = $2;
 HEAP32[$5>>2] = $4;
 $6 = $2;
 $7 = ((($6)) + 20|0);
 $8 = $3;
 $9 = $2;
 _fus_class_init($7,$8,2036,16,$9,9,10);
 $10 = $2;
 $11 = ((($10)) + 4|0);
 $12 = $2;
 $13 = ((($12)) + 20|0);
 _fus_array_init($11,$13);
 STACKTOP = sp;return;
}
function _fus_class_init_symtable_entry($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $2 = 0, $3 = 0, $4 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $2 = $0;
 $3 = $1;
 $4 = $3;
 _fus_symtable_entry_init_zero($4);
 STACKTOP = sp;return;
}
function _fus_class_cleanup_symtable_entry($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $2 = 0, $3 = 0, $4 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $2 = $0;
 $3 = $1;
 $4 = $3;
 _fus_symtable_entry_cleanup($4);
 STACKTOP = sp;return;
}
function _fus_symtable_cleanup($0) {
 $0 = $0|0;
 var $1 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $1 = $0;
 $2 = $1;
 $3 = ((($2)) + 4|0);
 _fus_array_cleanup($3);
 $4 = $1;
 $5 = ((($4)) + 20|0);
 _fus_class_cleanup($5);
 STACKTOP = sp;return;
}
function _fus_symtable_len($0) {
 $0 = $0|0;
 var $1 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $1 = $0;
 $2 = $1;
 $3 = ((($2)) + 4|0);
 $4 = ((($3)) + 8|0);
 $5 = HEAP32[$4>>2]|0;
 STACKTOP = sp;return ($5|0);
}
function _fus_symtable_get_entry($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $3 = $0;
 $4 = $1;
 $6 = $4;
 $7 = ($6|0)<(0);
 if ($7) {
  $2 = 0;
  $15 = $2;
  STACKTOP = sp;return ($15|0);
 } else {
  $8 = $3;
  $9 = ((($8)) + 4|0);
  $10 = ((($9)) + 4|0);
  $11 = HEAP32[$10>>2]|0;
  $5 = $11;
  $12 = $5;
  $13 = $4;
  $14 = (($12) + ($13<<4)|0);
  $2 = $14;
  $15 = $2;
  STACKTOP = sp;return ($15|0);
 }
 return (0)|0;
}
function _fus_symtable_get_token($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $3 = $0;
 $4 = $1;
 $6 = $3;
 $7 = $4;
 $8 = (_fus_symtable_get_entry($6,$7)|0);
 $5 = $8;
 $9 = $5;
 $10 = ($9|0)==(0|0);
 if ($10) {
  $2 = 0;
  $14 = $2;
  STACKTOP = sp;return ($14|0);
 } else {
  $11 = $5;
  $12 = ((($11)) + 8|0);
  $13 = HEAP32[$12>>2]|0;
  $2 = $13;
  $14 = $2;
  STACKTOP = sp;return ($14|0);
 }
 return (0)|0;
}
function _fus_symtable_get_token_safe($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $10 = 0, $11 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $2 = $0;
 $3 = $1;
 $5 = $2;
 $6 = $3;
 $7 = (_fus_symtable_get_token($5,$6)|0);
 $4 = $7;
 $8 = $4;
 $9 = ($8|0)!=(0|0);
 $10 = $4;
 $11 = $9 ? $10 : 2051;
 STACKTOP = sp;return ($11|0);
}
function _fus_symtable_add_from_token($0,$1,$2) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 var $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $3 = $0;
 $4 = $1;
 $5 = $2;
 $6 = $3;
 $7 = $4;
 $8 = $5;
 $9 = (_fus_symtable_append_from_token($6,$7,$8)|0);
 STACKTOP = sp;return ($9|0);
}
function _fus_symtable_append_from_token($0,$1,$2) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 var $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $20 = 0, $21 = 0, $22 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0;
 var label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 32|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(32|0);
 $3 = $0;
 $4 = $1;
 $5 = $2;
 $8 = $3;
 $9 = ((($8)) + 4|0);
 _fus_array_push($9);
 $10 = $3;
 $11 = ((($10)) + 4|0);
 $12 = ((($11)) + 8|0);
 $13 = HEAP32[$12>>2]|0;
 $14 = (($13) - 1)|0;
 $6 = $14;
 $15 = $3;
 $16 = $6;
 $17 = (_fus_symtable_get_entry($15,$16)|0);
 $7 = $17;
 $18 = $7;
 $19 = $3;
 $20 = $4;
 $21 = $5;
 _fus_symtable_entry_init($18,$19,$20,$21);
 $22 = $6;
 STACKTOP = sp;return ($22|0);
}
function _fus_symtable_get_from_token($0,$1,$2) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 var $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0, $29 = 0;
 var $3 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $4 = 0, $40 = 0, $41 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0;
 var sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 32|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(32|0);
 $4 = $0;
 $5 = $1;
 $6 = $2;
 $11 = $4;
 $12 = ((($11)) + 4|0);
 $13 = ((($12)) + 4|0);
 $14 = HEAP32[$13>>2]|0;
 $7 = $14;
 $15 = $4;
 $16 = ((($15)) + 4|0);
 $17 = ((($16)) + 8|0);
 $18 = HEAP32[$17>>2]|0;
 $8 = $18;
 $19 = $8;
 $20 = (($19) - 1)|0;
 $9 = $20;
 while(1) {
  $21 = $9;
  $22 = ($21|0)>=(0);
  if (!($22)) {
   label = 7;
   break;
  }
  $23 = $7;
  $24 = $9;
  $25 = (($23) + ($24<<4)|0);
  $10 = $25;
  $26 = $10;
  $27 = ((($26)) + 4|0);
  $28 = HEAP32[$27>>2]|0;
  $29 = $6;
  $30 = ($28|0)==($29|0);
  if ($30) {
   $31 = $10;
   $32 = ((($31)) + 8|0);
   $33 = HEAP32[$32>>2]|0;
   $34 = $5;
   $35 = $6;
   $36 = (_strncmp($33,$34,$35)|0);
   $37 = ($36|0)!=(0);
   if (!($37)) {
    label = 5;
    break;
   }
  }
  $39 = $9;
  $40 = (($39) + -1)|0;
  $9 = $40;
 }
 if ((label|0) == 5) {
  $38 = $9;
  $3 = $38;
  $41 = $3;
  STACKTOP = sp;return ($41|0);
 }
 else if ((label|0) == 7) {
  $3 = -1;
  $41 = $3;
  STACKTOP = sp;return ($41|0);
 }
 return (0)|0;
}
function _fus_symtable_get_or_add_from_token($0,$1,$2) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 var $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 32|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(32|0);
 $4 = $0;
 $5 = $1;
 $6 = $2;
 $8 = $4;
 $9 = $5;
 $10 = $6;
 $11 = (_fus_symtable_get_from_token($8,$9,$10)|0);
 $7 = $11;
 $12 = $7;
 $13 = ($12|0)<(0);
 if ($13) {
  $14 = $4;
  $15 = $5;
  $16 = $6;
  $17 = (_fus_symtable_append_from_token($14,$15,$16)|0);
  $3 = $17;
  $19 = $3;
  STACKTOP = sp;return ($19|0);
 } else {
  $18 = $7;
  $3 = $18;
  $19 = $3;
  STACKTOP = sp;return ($19|0);
 }
 return (0)|0;
}
function _fus_symtable_add_from_string($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $2 = $0;
 $3 = $1;
 $4 = $2;
 $5 = $3;
 $6 = $3;
 $7 = (_strlen($6)|0);
 $8 = (_fus_symtable_add_from_token($4,$5,$7)|0);
 STACKTOP = sp;return ($8|0);
}
function _fus_symtable_get_from_string($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $2 = $0;
 $3 = $1;
 $4 = $2;
 $5 = $3;
 $6 = $3;
 $7 = (_strlen($6)|0);
 $8 = (_fus_symtable_get_from_token($4,$5,$7)|0);
 STACKTOP = sp;return ($8|0);
}
function _fus_symtable_get_or_add_from_string($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $2 = $0;
 $3 = $1;
 $4 = $2;
 $5 = $3;
 $6 = $3;
 $7 = (_strlen($6)|0);
 $8 = (_fus_symtable_get_or_add_from_token($4,$5,$7)|0);
 STACKTOP = sp;return ($8|0);
}
function _fus_write_long_int($0) {
 $0 = $0|0;
 var $1 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0;
 var $28 = 0, $29 = 0, $3 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0;
 var sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 32|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(32|0);
 $2 = $0;
 $7 = $2;
 $8 = ($7|0)==(0);
 if ($8) {
  $1 = 6879;
  $39 = $1;
  STACKTOP = sp;return ($39|0);
 }
 $3 = 20;
 $4 = (11163);
 $9 = $4;
 HEAP8[$9>>0] = 0;
 $10 = $2;
 $11 = ($10|0)<(0);
 $12 = $11&1;
 $5 = $12;
 $13 = $5;
 $14 = $13&1;
 if ($14) {
  $15 = $2;
  $16 = (0 - ($15))|0;
  $2 = $16;
 }
 while(1) {
  $17 = $2;
  $18 = ($17|0)!=(0);
  if (!($18)) {
   break;
  }
  $19 = $2;
  $20 = (($19|0) % 10)&-1;
  $21 = (($20) + 48)|0;
  $22 = $21&255;
  $6 = $22;
  $23 = $2;
  $24 = (($23|0) / 10)&-1;
  $2 = $24;
  $25 = $4;
  $26 = ($25|0)==(11144|0);
  if ($26) {
   label = 7;
   break;
  }
  $27 = $4;
  $28 = ((($27)) + -1|0);
  $4 = $28;
  $29 = $6;
  $30 = $4;
  HEAP8[$30>>0] = $29;
 }
 if ((label|0) == 7) {
  $1 = 0;
  $39 = $1;
  STACKTOP = sp;return ($39|0);
 }
 $31 = $5;
 $32 = $31&1;
 do {
  if ($32) {
   $33 = $4;
   $34 = ($33|0)==(11144|0);
   if (!($34)) {
    $35 = $4;
    $36 = ((($35)) + -1|0);
    $4 = $36;
    $37 = $4;
    HEAP8[$37>>0] = 45;
    break;
   }
   $1 = 0;
   $39 = $1;
   STACKTOP = sp;return ($39|0);
  }
 } while(0);
 $38 = $4;
 $1 = $38;
 $39 = $1;
 STACKTOP = sp;return ($39|0);
}
function _fus_value_type_msg($0) {
 $0 = $0|0;
 var $$byval_copy = 0, $$byval_copy1 = 0, $$byval_copy2 = 0, $$byval_copy3 = 0, $$byval_copy4 = 0, $$byval_copy5 = 0, $$byval_copy6 = 0, $$byval_copy7 = 0, $1 = 0, $10 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 48|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(48|0);
 $$byval_copy7 = sp + 32|0;
 $$byval_copy6 = sp + 28|0;
 $$byval_copy5 = sp + 24|0;
 $$byval_copy4 = sp + 20|0;
 $$byval_copy3 = sp + 16|0;
 $$byval_copy2 = sp + 12|0;
 $$byval_copy1 = sp + 8|0;
 $$byval_copy = sp + 4|0;
 ;HEAP32[$$byval_copy>>2]=HEAP32[$0>>2]|0;
 $2 = (_fus_value_is_int($$byval_copy)|0);
 do {
  if ($2) {
   $1 = 2067;
  } else {
   ;HEAP32[$$byval_copy1>>2]=HEAP32[$0>>2]|0;
   $3 = (_fus_value_is_sym($$byval_copy1)|0);
   if ($3) {
    $1 = 2071;
    break;
   }
   ;HEAP32[$$byval_copy2>>2]=HEAP32[$0>>2]|0;
   $4 = (_fus_value_is_null($$byval_copy2)|0);
   if ($4) {
    $1 = 2075;
    break;
   }
   ;HEAP32[$$byval_copy3>>2]=HEAP32[$0>>2]|0;
   $5 = (_fus_value_is_bool($$byval_copy3)|0);
   if ($5) {
    $1 = 2080;
    break;
   }
   ;HEAP32[$$byval_copy4>>2]=HEAP32[$0>>2]|0;
   $6 = (_fus_value_is_arr($$byval_copy4)|0);
   if ($6) {
    $1 = 5047;
    break;
   }
   ;HEAP32[$$byval_copy5>>2]=HEAP32[$0>>2]|0;
   $7 = (_fus_value_is_str($$byval_copy5)|0);
   if ($7) {
    $1 = 2085;
    break;
   }
   ;HEAP32[$$byval_copy6>>2]=HEAP32[$0>>2]|0;
   $8 = (_fus_value_is_obj($$byval_copy6)|0);
   if ($8) {
    $1 = 5309;
    break;
   }
   ;HEAP32[$$byval_copy7>>2]=HEAP32[$0>>2]|0;
   $9 = (_fus_value_is_fun($$byval_copy7)|0);
   if ($9) {
    $1 = 2089;
    break;
   } else {
    $1 = 2093;
    break;
   }
  }
 } while(0);
 $10 = $1;
 STACKTOP = sp;return ($10|0);
}
function _fus_value_is_int($0) {
 $0 = $0|0;
 var $1 = 0, $2 = 0, $3 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $1 = HEAP32[$0>>2]|0;
 $2 = $1 & 3;
 $3 = ($2|0)==(1);
 return ($3|0);
}
function _fus_value_is_sym($0) {
 $0 = $0|0;
 var $1 = 0, $2 = 0, $3 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $1 = HEAP32[$0>>2]|0;
 $2 = $1 & 3;
 $3 = ($2|0)==(2);
 return ($3|0);
}
function _fus_value_is_null($0) {
 $0 = $0|0;
 var $1 = 0, $2 = 0, $3 = 0, $4 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $1 = sp;
 $2 = HEAP32[$0>>2]|0;
 HEAP32[$1>>2] = 3;
 $3 = HEAP32[$1>>2]|0;
 $4 = ($2|0)==($3|0);
 STACKTOP = sp;return ($4|0);
}
function _fus_value_is_bool($0) {
 $0 = $0|0;
 var $1 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $1 = sp + 4|0;
 $2 = sp;
 $3 = HEAP32[$0>>2]|0;
 HEAP32[$1>>2] = 7;
 $4 = HEAP32[$1>>2]|0;
 $5 = ($3|0)==($4|0);
 if ($5) {
  $9 = 1;
  STACKTOP = sp;return ($9|0);
 }
 $6 = HEAP32[$0>>2]|0;
 HEAP32[$2>>2] = 11;
 $7 = HEAP32[$2>>2]|0;
 $8 = ($6|0)==($7|0);
 $9 = $8;
 STACKTOP = sp;return ($9|0);
}
function _fus_value_is_arr($0) {
 $0 = $0|0;
 var $1 = 0, $10 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $1 = HEAP32[$0>>2]|0;
 $2 = $1 & 3;
 $3 = ($2|0)==(0);
 if (!($3)) {
  $10 = 0;
  return ($10|0);
 }
 $4 = HEAP32[$0>>2]|0;
 $5 = ($4|0)!=(0|0);
 if (!($5)) {
  $10 = 0;
  return ($10|0);
 }
 $6 = HEAP32[$0>>2]|0;
 $7 = ((($6)) + 4|0);
 $8 = HEAP32[$7>>2]|0;
 $9 = ($8|0)==(0);
 $10 = $9;
 return ($10|0);
}
function _fus_value_is_str($0) {
 $0 = $0|0;
 var $1 = 0, $10 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $1 = HEAP32[$0>>2]|0;
 $2 = $1 & 3;
 $3 = ($2|0)==(0);
 if (!($3)) {
  $10 = 0;
  return ($10|0);
 }
 $4 = HEAP32[$0>>2]|0;
 $5 = ($4|0)!=(0|0);
 if (!($5)) {
  $10 = 0;
  return ($10|0);
 }
 $6 = HEAP32[$0>>2]|0;
 $7 = ((($6)) + 4|0);
 $8 = HEAP32[$7>>2]|0;
 $9 = ($8|0)==(2);
 $10 = $9;
 return ($10|0);
}
function _fus_value_is_obj($0) {
 $0 = $0|0;
 var $1 = 0, $10 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $1 = HEAP32[$0>>2]|0;
 $2 = $1 & 3;
 $3 = ($2|0)==(0);
 if (!($3)) {
  $10 = 0;
  return ($10|0);
 }
 $4 = HEAP32[$0>>2]|0;
 $5 = ($4|0)!=(0|0);
 if (!($5)) {
  $10 = 0;
  return ($10|0);
 }
 $6 = HEAP32[$0>>2]|0;
 $7 = ((($6)) + 4|0);
 $8 = HEAP32[$7>>2]|0;
 $9 = ($8|0)==(1);
 $10 = $9;
 return ($10|0);
}
function _fus_value_is_fun($0) {
 $0 = $0|0;
 var $1 = 0, $10 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $1 = HEAP32[$0>>2]|0;
 $2 = $1 & 3;
 $3 = ($2|0)==(0);
 if (!($3)) {
  $10 = 0;
  return ($10|0);
 }
 $4 = HEAP32[$0>>2]|0;
 $5 = ($4|0)!=(0|0);
 if (!($5)) {
  $10 = 0;
  return ($10|0);
 }
 $6 = HEAP32[$0>>2]|0;
 $7 = ((($6)) + 4|0);
 $8 = HEAP32[$7>>2]|0;
 $9 = ($8|0)==(3);
 $10 = $9;
 return ($10|0);
}
function _fus_err_code_msg($0) {
 $0 = $0|0;
 var $1 = 0, $10 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, $or$cond = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $2 = $0;
 $3 = $2;
 $4 = ($3>>>0)<(0);
 $5 = $2;
 $6 = ($5>>>0)>=(7);
 $or$cond = $4 | $6;
 if ($or$cond) {
  $1 = 2101;
  $10 = $1;
  STACKTOP = sp;return ($10|0);
 } else {
  $7 = $2;
  $8 = (56 + ($7<<2)|0);
  $9 = HEAP32[$8>>2]|0;
  $1 = $9;
  $10 = $1;
  STACKTOP = sp;return ($10|0);
 }
 return (0)|0;
}
function _fus_value_err($0,$1,$2) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 var $3 = 0, $4 = 0, $5 = 0, $6 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $3 = $1;
 $4 = $2;
 $5 = $3;
 $6 = $4;
 _fus_vm_error($5,$6);
 HEAP32[$0>>2] = 0;
 STACKTOP = sp;return;
}
function _fus_value_sym($0,$1,$2) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 var $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, $vararg_buffer = 0, $vararg_ptr1 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 32|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(32|0);
 $vararg_buffer = sp;
 $5 = sp + 8|0;
 $3 = $1;
 $4 = $2;
 $6 = $4;
 $7 = ($6|0)>(536870911);
 if ($7) {
  $8 = $3;
  _fus_value_err($0,$8,1);
  STACKTOP = sp;return;
 }
 $9 = $4;
 $10 = ($9|0)<(0);
 if ($10) {
  $11 = HEAP32[54]|0;
  $12 = $4;
  HEAP32[$vararg_buffer>>2] = 2216;
  $vararg_ptr1 = ((($vararg_buffer)) + 4|0);
  HEAP32[$vararg_ptr1>>2] = $12;
  (_fprintf($11,2188,$vararg_buffer)|0);
  $13 = $3;
  _fus_value_err($0,$13,6);
  STACKTOP = sp;return;
 } else {
  $14 = $4;
  $15 = $14 << 2;
  $16 = $15 | 2;
  HEAP32[$5>>2] = $16;
  ;HEAP32[$0>>2]=HEAP32[$5>>2]|0;
  STACKTOP = sp;return;
 }
}
function _fus_value_sym_decode($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $10 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $3 = $0;
 $4 = HEAP32[$1>>2]|0;
 $5 = $4 & 3;
 $6 = ($5|0)==(2);
 if ($6) {
  $8 = HEAP32[$1>>2]|0;
  $9 = $8 >> 2;
  $2 = $9;
 } else {
  $7 = $3;
  _fus_vm_error($7,0);
  $2 = 0;
 }
 $10 = $2;
 STACKTOP = sp;return ($10|0);
}
function _fus_value_int($0,$1,$2) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 var $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $5 = sp;
 $3 = $1;
 $4 = $2;
 $6 = $4;
 $7 = ($6|0)>(536870911);
 if ($7) {
  $8 = $3;
  _fus_value_err($0,$8,1);
  STACKTOP = sp;return;
 }
 $9 = $4;
 $10 = ($9|0)<(-536870912);
 if ($10) {
  $11 = $3;
  _fus_value_err($0,$11,2);
  STACKTOP = sp;return;
 } else {
  $12 = $4;
  $13 = $12 << 2;
  $14 = $13 | 1;
  HEAP32[$5>>2] = $14;
  ;HEAP32[$0>>2]=HEAP32[$5>>2]|0;
  STACKTOP = sp;return;
 }
}
function _fus_value_int_decode($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $10 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $3 = $0;
 $4 = HEAP32[$1>>2]|0;
 $5 = $4 & 3;
 $6 = ($5|0)==(1);
 if ($6) {
  $8 = HEAP32[$1>>2]|0;
  $9 = $8 >> 2;
  $2 = $9;
 } else {
  $7 = $3;
  _fus_vm_error($7,0);
  $2 = 0;
 }
 $10 = $2;
 STACKTOP = sp;return ($10|0);
}
function _fus_value_attach($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $10 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $2 = $0;
 $4 = HEAP32[$1>>2]|0;
 $5 = $4 & 3;
 $3 = $5;
 $6 = $3;
 $7 = ($6|0)==(0);
 if ($7) {
  $8 = HEAP32[$1>>2]|0;
  $9 = ($8|0)!=(0|0);
  if ($9) {
   $10 = HEAP32[$1>>2]|0;
   _fus_boxed_attach($10);
  }
 }
 STACKTOP = sp;return;
}
function _fus_value_detach($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $10 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $2 = $0;
 $4 = HEAP32[$1>>2]|0;
 $5 = $4 & 3;
 $3 = $5;
 $6 = $3;
 $7 = ($6|0)==(0);
 if ($7) {
  $8 = HEAP32[$1>>2]|0;
  $9 = ($8|0)!=(0|0);
  if ($9) {
   $10 = HEAP32[$1>>2]|0;
   _fus_boxed_detach($10);
  }
 }
 STACKTOP = sp;return;
}
function _fus_value_is_err($0) {
 $0 = $0|0;
 var $1 = 0, $2 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $1 = HEAP32[$0>>2]|0;
 $2 = ($1|0)==(0|0);
 return ($2|0);
}
function _fus_value_fprint($0,$1,$2) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 var $$byval_copy = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 4144|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(4144|0);
 $$byval_copy = sp + 4140|0;
 $5 = sp;
 $3 = $0;
 $4 = $2;
 _fus_printer_init($5);
 $6 = $4;
 _fus_printer_set_file($5,$6);
 $7 = $3;
 ;HEAP32[$$byval_copy>>2]=HEAP32[$1>>2]|0;
 (_fus_printer_print_value($5,$7,$$byval_copy)|0);
 _fus_printer_cleanup($5);
 STACKTOP = sp;return;
}
function _fus_class_init_value($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $2 = $0;
 $3 = $1;
 $5 = $3;
 $4 = $5;
 $6 = $4;
 HEAP32[$6>>2] = 0;
 STACKTOP = sp;return;
}
function _fus_class_cleanup_value($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $$byval_copy = 0, $10 = 0, $11 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 32|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(32|0);
 $$byval_copy = sp + 16|0;
 $2 = $0;
 $3 = $1;
 $6 = $2;
 $7 = ((($6)) + 12|0);
 $8 = HEAP32[$7>>2]|0;
 $4 = $8;
 $9 = $3;
 $5 = $9;
 $10 = $4;
 $11 = $5;
 ;HEAP32[$$byval_copy>>2]=HEAP32[$11>>2]|0;
 _fus_value_detach($10,$$byval_copy);
 STACKTOP = sp;return;
}
function _fus_vm_init($0,$1,$2) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 var $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0, $29 = 0;
 var $3 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $4 = 0, $40 = 0, $41 = 0, $42 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0;
 var label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $3 = $0;
 $4 = $1;
 $5 = $2;
 $6 = $4;
 $7 = $3;
 HEAP32[$7>>2] = $6;
 $8 = $5;
 $9 = $3;
 $10 = ((($9)) + 4|0);
 HEAP32[$10>>2] = $8;
 $11 = $3;
 $12 = ((($11)) + 8|0);
 HEAP32[$12>>2] = 0;
 $13 = $3;
 $14 = ((($13)) + 12|0);
 HEAP32[$14>>2] = 11;
 $15 = $3;
 $16 = ((($15)) + 16|0);
 HEAP32[$16>>2] = 0;
 $17 = $3;
 $18 = ((($17)) + 20|0);
 HEAP32[$18>>2] = 0;
 $19 = $3;
 $20 = ((($19)) + 24|0);
 $21 = $4;
 $22 = $3;
 _fus_class_init_zero($20,$21,2230,1,$22);
 $23 = $3;
 $24 = ((($23)) + 48|0);
 $25 = $4;
 $26 = $3;
 _fus_class_init_zero($24,$25,2235,4,$26);
 $27 = $3;
 $28 = ((($27)) + 72|0);
 $29 = $4;
 $30 = $3;
 _fus_class_init_zero($28,$29,2241,4,$30);
 $31 = $3;
 $32 = ((($31)) + 96|0);
 $33 = $4;
 $34 = $3;
 _fus_class_init($32,$33,2249,16,$34,12,13);
 $35 = $3;
 $36 = ((($35)) + 120|0);
 $37 = $4;
 $38 = $3;
 _fus_class_init($36,$37,2255,4,$38,14,15);
 $39 = $3;
 $40 = ((($39)) + 144|0);
 $41 = $4;
 $42 = $3;
 _fus_class_init($40,$41,5047,16,$42,16,17);
 STACKTOP = sp;return;
}
function _fus_vm_error_callback_default($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $10 = 0, $11 = 0, $12 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, $vararg_buffer = 0, $vararg_buffer2 = 0, $vararg_ptr1 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 32|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(32|0);
 $vararg_buffer2 = sp + 8|0;
 $vararg_buffer = sp;
 $2 = $0;
 $3 = $1;
 $5 = $3;
 $6 = (_fus_err_code_msg($5)|0);
 $4 = $6;
 $7 = HEAP32[54]|0;
 $8 = $3;
 $9 = $4;
 HEAP32[$vararg_buffer>>2] = $8;
 $vararg_ptr1 = ((($vararg_buffer)) + 4|0);
 HEAP32[$vararg_ptr1>>2] = $9;
 (_fprintf($7,2261,$vararg_buffer)|0);
 $10 = HEAP32[54]|0;
 (_fprintf($10,3141,$vararg_buffer2)|0);
 $11 = $2;
 $12 = HEAP32[$11>>2]|0;
 _fus_exit($12,1);
 STACKTOP = sp;return;
}
function _fus_vm_cleanup($0) {
 $0 = $0|0;
 var $$byval_copy = 0, $1 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0;
 var $27 = 0, $28 = 0, $29 = 0, $3 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, $vararg_buffer = 0;
 var $vararg_buffer2 = 0, $vararg_ptr1 = 0, $vararg_ptr5 = 0, $vararg_ptr6 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 48|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(48|0);
 $$byval_copy = sp + 32|0;
 $vararg_buffer2 = sp + 8|0;
 $vararg_buffer = sp;
 $3 = sp + 20|0;
 $1 = $0;
 $4 = $1;
 $5 = ((($4)) + 8|0);
 $6 = HEAP32[$5>>2]|0;
 $7 = ($6|0)!=(0);
 if ($7) {
  $8 = HEAP32[54]|0;
  $9 = $1;
  $10 = ((($9)) + 8|0);
  $11 = HEAP32[$10>>2]|0;
  HEAP32[$vararg_buffer>>2] = 2332;
  $vararg_ptr1 = ((($vararg_buffer)) + 4|0);
  HEAP32[$vararg_ptr1>>2] = $11;
  (_fprintf($8,2279,$vararg_buffer)|0);
  $12 = $1;
  $13 = ((($12)) + 20|0);
  $14 = HEAP32[$13>>2]|0;
  $2 = $14;
  while(1) {
   $15 = $2;
   $16 = ($15|0)!=(0|0);
   $17 = HEAP32[54]|0;
   if (!($16)) {
    break;
   }
   $18 = $2;
   HEAP32[$3>>2] = $18;
   ;HEAP32[$$byval_copy>>2]=HEAP32[$3>>2]|0;
   $19 = (_fus_value_type_msg($$byval_copy)|0);
   $20 = $2;
   $21 = $2;
   $22 = ((($21)) + 8|0);
   $23 = HEAP32[$22>>2]|0;
   HEAP32[$vararg_buffer2>>2] = $19;
   $vararg_ptr5 = ((($vararg_buffer2)) + 4|0);
   HEAP32[$vararg_ptr5>>2] = $20;
   $vararg_ptr6 = ((($vararg_buffer2)) + 8|0);
   HEAP32[$vararg_ptr6>>2] = $23;
   (_fprintf($17,2347,$vararg_buffer2)|0);
   $24 = $2;
   $25 = ((($24)) + 64|0);
   $26 = HEAP32[$25>>2]|0;
   $2 = $26;
  }
  (_fflush($17)|0);
 }
 $27 = $1;
 $28 = ((($27)) + 24|0);
 _fus_class_cleanup($28);
 $29 = $1;
 $30 = ((($29)) + 48|0);
 _fus_class_cleanup($30);
 $31 = $1;
 $32 = ((($31)) + 72|0);
 _fus_class_cleanup($32);
 $33 = $1;
 $34 = ((($33)) + 96|0);
 _fus_class_cleanup($34);
 $35 = $1;
 $36 = ((($35)) + 120|0);
 _fus_class_cleanup($36);
 $37 = $1;
 $38 = ((($37)) + 144|0);
 _fus_class_cleanup($38);
 STACKTOP = sp;return;
}
function _fus_vm_error($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $10 = 0, $11 = 0, $12 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $2 = $0;
 $3 = $1;
 $4 = $2;
 $5 = ((($4)) + 12|0);
 $6 = HEAP32[$5>>2]|0;
 $7 = ($6|0)!=(0|0);
 if (!($7)) {
  STACKTOP = sp;return;
 }
 $8 = $2;
 $9 = ((($8)) + 12|0);
 $10 = HEAP32[$9>>2]|0;
 $11 = $2;
 $12 = $3;
 FUNCTION_TABLE_vii[$10 & 31]($11,$12);
 STACKTOP = sp;return;
}
function _run_unboxed_tests($0,$1,$2) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 var $$byval_copy = 0, $$byval_copy103 = 0, $$byval_copy104 = 0, $$byval_copy105 = 0, $$byval_copy106 = 0, $$byval_copy107 = 0, $$byval_copy108 = 0, $$byval_copy109 = 0, $$byval_copy110 = 0, $$byval_copy111 = 0, $$byval_copy112 = 0, $$byval_copy113 = 0, $$byval_copy114 = 0, $$byval_copy115 = 0, $$byval_copy116 = 0, $$byval_copy117 = 0, $10 = 0, $100 = 0, $101 = 0, $102 = 0;
 var $103 = 0, $104 = 0, $105 = 0, $106 = 0, $107 = 0, $108 = 0, $109 = 0, $11 = 0, $110 = 0, $111 = 0, $112 = 0, $113 = 0, $114 = 0, $115 = 0, $116 = 0, $117 = 0, $118 = 0, $119 = 0, $12 = 0, $120 = 0;
 var $121 = 0, $122 = 0, $123 = 0, $124 = 0, $125 = 0, $126 = 0, $127 = 0, $128 = 0, $129 = 0, $13 = 0, $130 = 0, $131 = 0, $132 = 0, $133 = 0, $134 = 0, $135 = 0, $136 = 0, $137 = 0, $138 = 0, $139 = 0;
 var $14 = 0, $140 = 0, $141 = 0, $142 = 0, $143 = 0, $144 = 0, $145 = 0, $146 = 0, $147 = 0, $148 = 0, $149 = 0, $15 = 0, $150 = 0, $151 = 0, $152 = 0, $153 = 0, $154 = 0, $155 = 0, $156 = 0, $157 = 0;
 var $158 = 0, $159 = 0, $16 = 0, $160 = 0, $161 = 0, $162 = 0, $163 = 0, $164 = 0, $165 = 0, $166 = 0, $167 = 0, $168 = 0, $169 = 0, $17 = 0, $170 = 0, $171 = 0, $172 = 0, $173 = 0, $174 = 0, $175 = 0;
 var $176 = 0, $177 = 0, $178 = 0, $179 = 0, $18 = 0, $180 = 0, $181 = 0, $182 = 0, $183 = 0, $184 = 0, $185 = 0, $186 = 0, $187 = 0, $188 = 0, $189 = 0, $19 = 0, $190 = 0, $191 = 0, $192 = 0, $193 = 0;
 var $194 = 0, $195 = 0, $196 = 0, $197 = 0, $198 = 0, $199 = 0, $20 = 0, $200 = 0, $201 = 0, $202 = 0, $203 = 0, $204 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0;
 var $29 = 0, $3 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $4 = 0, $40 = 0, $41 = 0, $42 = 0, $43 = 0, $44 = 0, $45 = 0, $46 = 0;
 var $47 = 0, $48 = 0, $49 = 0, $5 = 0, $50 = 0, $51 = 0, $52 = 0, $53 = 0, $54 = 0, $55 = 0, $56 = 0, $57 = 0, $58 = 0, $59 = 0, $6 = 0, $60 = 0, $61 = 0, $62 = 0, $63 = 0, $64 = 0;
 var $65 = 0, $66 = 0, $67 = 0, $68 = 0, $69 = 0, $7 = 0, $70 = 0, $71 = 0, $72 = 0, $73 = 0, $74 = 0, $75 = 0, $76 = 0, $77 = 0, $78 = 0, $79 = 0, $8 = 0, $80 = 0, $81 = 0, $82 = 0;
 var $83 = 0, $84 = 0, $85 = 0, $86 = 0, $87 = 0, $88 = 0, $89 = 0, $9 = 0, $90 = 0, $91 = 0, $92 = 0, $93 = 0, $94 = 0, $95 = 0, $96 = 0, $97 = 0, $98 = 0, $99 = 0, $vararg_buffer = 0, $vararg_buffer1 = 0;
 var $vararg_buffer101 = 0, $vararg_buffer11 = 0, $vararg_buffer13 = 0, $vararg_buffer17 = 0, $vararg_buffer19 = 0, $vararg_buffer21 = 0, $vararg_buffer25 = 0, $vararg_buffer27 = 0, $vararg_buffer29 = 0, $vararg_buffer3 = 0, $vararg_buffer33 = 0, $vararg_buffer35 = 0, $vararg_buffer37 = 0, $vararg_buffer41 = 0, $vararg_buffer43 = 0, $vararg_buffer45 = 0, $vararg_buffer49 = 0, $vararg_buffer5 = 0, $vararg_buffer51 = 0, $vararg_buffer53 = 0;
 var $vararg_buffer57 = 0, $vararg_buffer59 = 0, $vararg_buffer61 = 0, $vararg_buffer65 = 0, $vararg_buffer67 = 0, $vararg_buffer69 = 0, $vararg_buffer73 = 0, $vararg_buffer75 = 0, $vararg_buffer77 = 0, $vararg_buffer81 = 0, $vararg_buffer83 = 0, $vararg_buffer85 = 0, $vararg_buffer89 = 0, $vararg_buffer9 = 0, $vararg_buffer91 = 0, $vararg_buffer94 = 0, $vararg_buffer99 = 0, $vararg_ptr16 = 0, $vararg_ptr24 = 0, $vararg_ptr32 = 0;
 var $vararg_ptr40 = 0, $vararg_ptr48 = 0, $vararg_ptr56 = 0, $vararg_ptr64 = 0, $vararg_ptr72 = 0, $vararg_ptr8 = 0, $vararg_ptr80 = 0, $vararg_ptr88 = 0, $vararg_ptr97 = 0, $vararg_ptr98 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 544|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(544|0);
 $$byval_copy117 = sp + 536|0;
 $$byval_copy116 = sp + 532|0;
 $$byval_copy115 = sp + 528|0;
 $$byval_copy114 = sp + 524|0;
 $$byval_copy113 = sp + 520|0;
 $$byval_copy112 = sp + 516|0;
 $$byval_copy111 = sp + 512|0;
 $$byval_copy110 = sp + 508|0;
 $$byval_copy109 = sp + 504|0;
 $$byval_copy108 = sp + 500|0;
 $$byval_copy107 = sp + 496|0;
 $$byval_copy106 = sp + 492|0;
 $$byval_copy105 = sp + 488|0;
 $$byval_copy104 = sp + 484|0;
 $$byval_copy103 = sp + 480|0;
 $$byval_copy = sp + 476|0;
 $vararg_buffer101 = sp + 312|0;
 $vararg_buffer99 = sp + 304|0;
 $vararg_buffer94 = sp + 288|0;
 $vararg_buffer91 = sp + 280|0;
 $vararg_buffer89 = sp + 272|0;
 $vararg_buffer85 = sp + 264|0;
 $vararg_buffer83 = sp + 256|0;
 $vararg_buffer81 = sp + 248|0;
 $vararg_buffer77 = sp + 240|0;
 $vararg_buffer75 = sp + 232|0;
 $vararg_buffer73 = sp + 224|0;
 $vararg_buffer69 = sp + 216|0;
 $vararg_buffer67 = sp + 208|0;
 $vararg_buffer65 = sp + 200|0;
 $vararg_buffer61 = sp + 192|0;
 $vararg_buffer59 = sp + 184|0;
 $vararg_buffer57 = sp + 176|0;
 $vararg_buffer53 = sp + 168|0;
 $vararg_buffer51 = sp + 160|0;
 $vararg_buffer49 = sp + 152|0;
 $vararg_buffer45 = sp + 144|0;
 $vararg_buffer43 = sp + 136|0;
 $vararg_buffer41 = sp + 128|0;
 $vararg_buffer37 = sp + 120|0;
 $vararg_buffer35 = sp + 112|0;
 $vararg_buffer33 = sp + 104|0;
 $vararg_buffer29 = sp + 96|0;
 $vararg_buffer27 = sp + 88|0;
 $vararg_buffer25 = sp + 80|0;
 $vararg_buffer21 = sp + 72|0;
 $vararg_buffer19 = sp + 64|0;
 $vararg_buffer17 = sp + 56|0;
 $vararg_buffer13 = sp + 48|0;
 $vararg_buffer11 = sp + 40|0;
 $vararg_buffer9 = sp + 32|0;
 $vararg_buffer5 = sp + 24|0;
 $vararg_buffer3 = sp + 16|0;
 $vararg_buffer1 = sp + 8|0;
 $vararg_buffer = sp;
 $10 = sp + 444|0;
 $13 = sp + 432|0;
 $16 = sp + 420|0;
 $19 = sp + 408|0;
 $22 = sp + 396|0;
 $26 = sp + 380|0;
 $27 = sp + 376|0;
 $32 = sp + 356|0;
 $33 = sp + 352|0;
 $34 = sp + 348|0;
 $3 = $0;
 $4 = $1;
 $5 = $2;
 $6 = 2373;
 $7 = 0;
 $8 = 0;
 (_printf(2401,$vararg_buffer)|0);
 $43 = $6;
 HEAP32[$vararg_buffer1>>2] = $43;
 (_printf(2483,$vararg_buffer1)|0);
 (_printf(2494,$vararg_buffer3)|0);
 $44 = $7;
 $45 = (($44) + 1)|0;
 $7 = $45;
 $46 = $3;
 $47 = $3;
 _fus_value_int($10,$47,0);
 ;HEAP32[$$byval_copy>>2]=HEAP32[$10>>2]|0;
 $48 = (_fus_value_int_decode($46,$$byval_copy)|0);
 $9 = $48;
 $11 = 0;
 $49 = $9;
 $50 = $11;
 HEAP32[$vararg_buffer5>>2] = $49;
 $vararg_ptr8 = ((($vararg_buffer5)) + 4|0);
 HEAP32[$vararg_ptr8>>2] = $50;
 (_printf(2549,$vararg_buffer5)|0);
 $51 = $9;
 $52 = $11;
 $53 = ($51|0)==($52|0);
 if (!($53)) {
  (_printf(2565,$vararg_buffer9)|0);
  $54 = $8;
  $55 = (($54) + 1)|0;
  $8 = $55;
 }
 (_printf(2577,$vararg_buffer11)|0);
 $56 = $7;
 $57 = (($56) + 1)|0;
 $7 = $57;
 $58 = $3;
 $59 = $3;
 _fus_value_int($13,$59,-1);
 ;HEAP32[$$byval_copy103>>2]=HEAP32[$13>>2]|0;
 $60 = (_fus_value_int_decode($58,$$byval_copy103)|0);
 $12 = $60;
 $14 = -1;
 $61 = $12;
 $62 = $14;
 HEAP32[$vararg_buffer13>>2] = $61;
 $vararg_ptr16 = ((($vararg_buffer13)) + 4|0);
 HEAP32[$vararg_ptr16>>2] = $62;
 (_printf(2549,$vararg_buffer13)|0);
 $63 = $12;
 $64 = $14;
 $65 = ($63|0)==($64|0);
 if (!($65)) {
  (_printf(2565,$vararg_buffer17)|0);
  $66 = $8;
  $67 = (($66) + 1)|0;
  $8 = $67;
 }
 (_printf(2634,$vararg_buffer19)|0);
 $68 = $7;
 $69 = (($68) + 1)|0;
 $7 = $69;
 $70 = $3;
 $71 = $3;
 _fus_value_int($16,$71,1);
 ;HEAP32[$$byval_copy104>>2]=HEAP32[$16>>2]|0;
 $72 = (_fus_value_int_decode($70,$$byval_copy104)|0);
 $15 = $72;
 $17 = 1;
 $73 = $15;
 $74 = $17;
 HEAP32[$vararg_buffer21>>2] = $73;
 $vararg_ptr24 = ((($vararg_buffer21)) + 4|0);
 HEAP32[$vararg_ptr24>>2] = $74;
 (_printf(2549,$vararg_buffer21)|0);
 $75 = $15;
 $76 = $17;
 $77 = ($75|0)==($76|0);
 if (!($77)) {
  (_printf(2565,$vararg_buffer25)|0);
  $78 = $8;
  $79 = (($78) + 1)|0;
  $8 = $79;
 }
 (_printf(2689,$vararg_buffer27)|0);
 $80 = $7;
 $81 = (($80) + 1)|0;
 $7 = $81;
 $82 = $3;
 $83 = $3;
 _fus_value_int($19,$83,-536870912);
 ;HEAP32[$$byval_copy105>>2]=HEAP32[$19>>2]|0;
 $84 = (_fus_value_int_decode($82,$$byval_copy105)|0);
 $18 = $84;
 $20 = -536870912;
 $85 = $18;
 $86 = $20;
 HEAP32[$vararg_buffer29>>2] = $85;
 $vararg_ptr32 = ((($vararg_buffer29)) + 4|0);
 HEAP32[$vararg_ptr32>>2] = $86;
 (_printf(2549,$vararg_buffer29)|0);
 $87 = $18;
 $88 = $20;
 $89 = ($87|0)==($88|0);
 if (!($89)) {
  (_printf(2565,$vararg_buffer33)|0);
  $90 = $8;
  $91 = (($90) + 1)|0;
  $8 = $91;
 }
 (_printf(2772,$vararg_buffer35)|0);
 $92 = $7;
 $93 = (($92) + 1)|0;
 $7 = $93;
 $94 = $3;
 $95 = $3;
 _fus_value_int($22,$95,536870911);
 ;HEAP32[$$byval_copy106>>2]=HEAP32[$22>>2]|0;
 $96 = (_fus_value_int_decode($94,$$byval_copy106)|0);
 $21 = $96;
 $23 = 536870911;
 $97 = $21;
 $98 = $23;
 HEAP32[$vararg_buffer37>>2] = $97;
 $vararg_ptr40 = ((($vararg_buffer37)) + 4|0);
 HEAP32[$vararg_ptr40>>2] = $98;
 (_printf(2549,$vararg_buffer37)|0);
 $99 = $21;
 $100 = $23;
 $101 = ($99|0)==($100|0);
 if (!($101)) {
  (_printf(2565,$vararg_buffer41)|0);
  $102 = $8;
  $103 = (($102) + 1)|0;
  $8 = $103;
 }
 $24 = 2;
 $25 = 3;
 $104 = $3;
 $105 = $24;
 _fus_value_int($26,$104,$105);
 $106 = $3;
 $107 = $25;
 _fus_value_int($27,$106,$107);
 (_printf(2855,$vararg_buffer43)|0);
 $108 = $7;
 $109 = (($108) + 1)|0;
 $7 = $109;
 $110 = $3;
 ;HEAP32[$$byval_copy107>>2]=HEAP32[$26>>2]|0;
 $111 = (_fus_value_int_decode($110,$$byval_copy107)|0);
 $28 = $111;
 $112 = $24;
 $29 = $112;
 $113 = $28;
 $114 = $29;
 HEAP32[$vararg_buffer45>>2] = $113;
 $vararg_ptr48 = ((($vararg_buffer45)) + 4|0);
 HEAP32[$vararg_ptr48>>2] = $114;
 (_printf(2549,$vararg_buffer45)|0);
 $115 = $28;
 $116 = $29;
 $117 = ($115|0)==($116|0);
 if (!($117)) {
  (_printf(2565,$vararg_buffer49)|0);
  $118 = $8;
  $119 = (($118) + 1)|0;
  $8 = $119;
 }
 (_printf(2892,$vararg_buffer51)|0);
 $120 = $7;
 $121 = (($120) + 1)|0;
 $7 = $121;
 $122 = $3;
 ;HEAP32[$$byval_copy108>>2]=HEAP32[$27>>2]|0;
 $123 = (_fus_value_int_decode($122,$$byval_copy108)|0);
 $30 = $123;
 $124 = $25;
 $31 = $124;
 $125 = $30;
 $126 = $31;
 HEAP32[$vararg_buffer53>>2] = $125;
 $vararg_ptr56 = ((($vararg_buffer53)) + 4|0);
 HEAP32[$vararg_ptr56>>2] = $126;
 (_printf(2549,$vararg_buffer53)|0);
 $127 = $30;
 $128 = $31;
 $129 = ($127|0)==($128|0);
 if (!($129)) {
  (_printf(2565,$vararg_buffer57)|0);
  $130 = $8;
  $131 = (($130) + 1)|0;
  $8 = $131;
 }
 $132 = $3;
 ;HEAP32[$$byval_copy109>>2]=HEAP32[$26>>2]|0;
 ;HEAP32[$$byval_copy110>>2]=HEAP32[$27>>2]|0;
 _fus_value_int_add($32,$132,$$byval_copy109,$$byval_copy110);
 $133 = $3;
 ;HEAP32[$$byval_copy111>>2]=HEAP32[$26>>2]|0;
 ;HEAP32[$$byval_copy112>>2]=HEAP32[$27>>2]|0;
 _fus_value_int_sub($33,$133,$$byval_copy111,$$byval_copy112);
 $134 = $3;
 ;HEAP32[$$byval_copy113>>2]=HEAP32[$26>>2]|0;
 ;HEAP32[$$byval_copy114>>2]=HEAP32[$27>>2]|0;
 _fus_value_int_mul($34,$134,$$byval_copy113,$$byval_copy114);
 (_printf(2929,$vararg_buffer59)|0);
 $135 = $7;
 $136 = (($135) + 1)|0;
 $7 = $136;
 $137 = $3;
 ;HEAP32[$$byval_copy115>>2]=HEAP32[$32>>2]|0;
 $138 = (_fus_value_int_decode($137,$$byval_copy115)|0);
 $35 = $138;
 $139 = $24;
 $140 = $25;
 $141 = (($139) + ($140))|0;
 $36 = $141;
 $142 = $35;
 $143 = $36;
 HEAP32[$vararg_buffer61>>2] = $142;
 $vararg_ptr64 = ((($vararg_buffer61)) + 4|0);
 HEAP32[$vararg_ptr64>>2] = $143;
 (_printf(2549,$vararg_buffer61)|0);
 $144 = $35;
 $145 = $36;
 $146 = ($144|0)==($145|0);
 if (!($146)) {
  (_printf(2565,$vararg_buffer65)|0);
  $147 = $8;
  $148 = (($147) + 1)|0;
  $8 = $148;
 }
 (_printf(2974,$vararg_buffer67)|0);
 $149 = $7;
 $150 = (($149) + 1)|0;
 $7 = $150;
 $151 = $3;
 ;HEAP32[$$byval_copy116>>2]=HEAP32[$33>>2]|0;
 $152 = (_fus_value_int_decode($151,$$byval_copy116)|0);
 $37 = $152;
 $153 = $24;
 $154 = $25;
 $155 = (($153) - ($154))|0;
 $38 = $155;
 $156 = $37;
 $157 = $38;
 HEAP32[$vararg_buffer69>>2] = $156;
 $vararg_ptr72 = ((($vararg_buffer69)) + 4|0);
 HEAP32[$vararg_ptr72>>2] = $157;
 (_printf(2549,$vararg_buffer69)|0);
 $158 = $37;
 $159 = $38;
 $160 = ($158|0)==($159|0);
 if (!($160)) {
  (_printf(2565,$vararg_buffer73)|0);
  $161 = $8;
  $162 = (($161) + 1)|0;
  $8 = $162;
 }
 (_printf(3019,$vararg_buffer75)|0);
 $163 = $7;
 $164 = (($163) + 1)|0;
 $7 = $164;
 $165 = $3;
 ;HEAP32[$$byval_copy117>>2]=HEAP32[$34>>2]|0;
 $166 = (_fus_value_int_decode($165,$$byval_copy117)|0);
 $39 = $166;
 $167 = $24;
 $168 = $25;
 $169 = Math_imul($167, $168)|0;
 $40 = $169;
 $170 = $39;
 $171 = $40;
 HEAP32[$vararg_buffer77>>2] = $170;
 $vararg_ptr80 = ((($vararg_buffer77)) + 4|0);
 HEAP32[$vararg_ptr80>>2] = $171;
 (_printf(2549,$vararg_buffer77)|0);
 $172 = $39;
 $173 = $40;
 $174 = ($172|0)==($173|0);
 if (!($174)) {
  (_printf(2565,$vararg_buffer81)|0);
  $175 = $8;
  $176 = (($175) + 1)|0;
  $8 = $176;
 }
 (_printf(3064,$vararg_buffer83)|0);
 $177 = $7;
 $178 = (($177) + 1)|0;
 $7 = $178;
 $179 = $3;
 $180 = ((($179)) + 8|0);
 $181 = HEAP32[$180>>2]|0;
 $41 = $181;
 $42 = 0;
 $182 = $41;
 $183 = $42;
 HEAP32[$vararg_buffer85>>2] = $182;
 $vararg_ptr88 = ((($vararg_buffer85)) + 4|0);
 HEAP32[$vararg_ptr88>>2] = $183;
 (_printf(3084,$vararg_buffer85)|0);
 $184 = $41;
 $185 = $42;
 $186 = ($184|0)==($185|0);
 if ($186) {
  $189 = $6;
  HEAP32[$vararg_buffer91>>2] = $189;
  (_printf(3098,$vararg_buffer91)|0);
  $190 = $7;
  $191 = $8;
  $192 = (($190) - ($191))|0;
  $193 = $7;
  $194 = $8;
  $195 = ($194|0)==(0);
  $196 = $195 ? 3107 : 3110;
  HEAP32[$vararg_buffer94>>2] = $192;
  $vararg_ptr97 = ((($vararg_buffer94)) + 4|0);
  HEAP32[$vararg_ptr97>>2] = $193;
  $vararg_ptr98 = ((($vararg_buffer94)) + 8|0);
  HEAP32[$vararg_ptr98>>2] = $196;
  (_printf(3115,$vararg_buffer94)|0);
  (_printf(2401,$vararg_buffer99)|0);
  (_printf(3141,$vararg_buffer101)|0);
  $197 = $7;
  $198 = $4;
  $199 = HEAP32[$198>>2]|0;
  $200 = (($199) + ($197))|0;
  HEAP32[$198>>2] = $200;
  $201 = $8;
  $202 = $5;
  $203 = HEAP32[$202>>2]|0;
  $204 = (($203) + ($201))|0;
  HEAP32[$202>>2] = $204;
  STACKTOP = sp;return;
 }
 (_printf(2565,$vararg_buffer89)|0);
 $187 = $8;
 $188 = (($187) + 1)|0;
 $8 = $188;
 $189 = $6;
 HEAP32[$vararg_buffer91>>2] = $189;
 (_printf(3098,$vararg_buffer91)|0);
 $190 = $7;
 $191 = $8;
 $192 = (($190) - ($191))|0;
 $193 = $7;
 $194 = $8;
 $195 = ($194|0)==(0);
 $196 = $195 ? 3107 : 3110;
 HEAP32[$vararg_buffer94>>2] = $192;
 $vararg_ptr97 = ((($vararg_buffer94)) + 4|0);
 HEAP32[$vararg_ptr97>>2] = $193;
 $vararg_ptr98 = ((($vararg_buffer94)) + 8|0);
 HEAP32[$vararg_ptr98>>2] = $196;
 (_printf(3115,$vararg_buffer94)|0);
 (_printf(2401,$vararg_buffer99)|0);
 (_printf(3141,$vararg_buffer101)|0);
 $197 = $7;
 $198 = $4;
 $199 = HEAP32[$198>>2]|0;
 $200 = (($199) + ($197))|0;
 HEAP32[$198>>2] = $200;
 $201 = $8;
 $202 = $5;
 $203 = HEAP32[$202>>2]|0;
 $204 = (($203) + ($201))|0;
 HEAP32[$202>>2] = $204;
 STACKTOP = sp;return;
}
function _run_arr_tests_basic($0,$1,$2) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 var $$byval_copy = 0, $$byval_copy223 = 0, $$byval_copy224 = 0, $$byval_copy225 = 0, $$byval_copy226 = 0, $$byval_copy227 = 0, $$byval_copy228 = 0, $$byval_copy229 = 0, $$byval_copy230 = 0, $$byval_copy231 = 0, $$byval_copy232 = 0, $$byval_copy233 = 0, $$byval_copy234 = 0, $$byval_copy235 = 0, $$byval_copy236 = 0, $$byval_copy237 = 0, $$byval_copy238 = 0, $$byval_copy239 = 0, $$byval_copy240 = 0, $$byval_copy241 = 0;
 var $$byval_copy242 = 0, $$byval_copy243 = 0, $$byval_copy244 = 0, $$byval_copy245 = 0, $$byval_copy246 = 0, $$byval_copy247 = 0, $$byval_copy248 = 0, $$byval_copy249 = 0, $$byval_copy250 = 0, $$byval_copy251 = 0, $10 = 0, $100 = 0, $101 = 0, $102 = 0, $103 = 0, $104 = 0, $105 = 0, $106 = 0, $107 = 0, $108 = 0;
 var $109 = 0, $11 = 0, $110 = 0, $111 = 0, $112 = 0, $113 = 0, $114 = 0, $115 = 0, $116 = 0, $117 = 0, $118 = 0, $119 = 0, $12 = 0, $120 = 0, $121 = 0, $122 = 0, $123 = 0, $124 = 0, $125 = 0, $126 = 0;
 var $127 = 0, $128 = 0, $129 = 0, $13 = 0, $130 = 0, $131 = 0, $132 = 0, $133 = 0, $134 = 0, $135 = 0, $136 = 0, $137 = 0, $138 = 0, $139 = 0, $14 = 0, $140 = 0, $141 = 0, $142 = 0, $143 = 0, $144 = 0;
 var $145 = 0, $146 = 0, $147 = 0, $148 = 0, $149 = 0, $15 = 0, $150 = 0, $151 = 0, $152 = 0, $153 = 0, $154 = 0, $155 = 0, $156 = 0, $157 = 0, $158 = 0, $159 = 0, $16 = 0, $160 = 0, $161 = 0, $162 = 0;
 var $163 = 0, $164 = 0, $165 = 0, $166 = 0, $167 = 0, $168 = 0, $169 = 0, $17 = 0, $170 = 0, $171 = 0, $172 = 0, $173 = 0, $174 = 0, $175 = 0, $176 = 0, $177 = 0, $178 = 0, $179 = 0, $18 = 0, $180 = 0;
 var $181 = 0, $182 = 0, $183 = 0, $184 = 0, $185 = 0, $186 = 0, $187 = 0, $188 = 0, $189 = 0, $19 = 0, $190 = 0, $191 = 0, $192 = 0, $193 = 0, $194 = 0, $195 = 0, $196 = 0, $197 = 0, $198 = 0, $199 = 0;
 var $20 = 0, $200 = 0, $201 = 0, $202 = 0, $203 = 0, $204 = 0, $205 = 0, $206 = 0, $207 = 0, $208 = 0, $209 = 0, $21 = 0, $210 = 0, $211 = 0, $212 = 0, $213 = 0, $214 = 0, $215 = 0, $216 = 0, $217 = 0;
 var $218 = 0, $219 = 0, $22 = 0, $220 = 0, $221 = 0, $222 = 0, $223 = 0, $224 = 0, $225 = 0, $226 = 0, $227 = 0, $228 = 0, $229 = 0, $23 = 0, $230 = 0, $231 = 0, $232 = 0, $233 = 0, $234 = 0, $235 = 0;
 var $236 = 0, $237 = 0, $238 = 0, $239 = 0, $24 = 0, $240 = 0, $241 = 0, $242 = 0, $243 = 0, $244 = 0, $245 = 0, $246 = 0, $247 = 0, $248 = 0, $249 = 0, $25 = 0, $250 = 0, $251 = 0, $252 = 0, $253 = 0;
 var $254 = 0, $255 = 0, $256 = 0, $257 = 0, $258 = 0, $259 = 0, $26 = 0, $260 = 0, $261 = 0, $262 = 0, $263 = 0, $264 = 0, $265 = 0, $266 = 0, $267 = 0, $268 = 0, $269 = 0, $27 = 0, $270 = 0, $271 = 0;
 var $272 = 0, $273 = 0, $274 = 0, $275 = 0, $276 = 0, $277 = 0, $278 = 0, $279 = 0, $28 = 0, $280 = 0, $281 = 0, $282 = 0, $283 = 0, $284 = 0, $285 = 0, $286 = 0, $287 = 0, $288 = 0, $289 = 0, $29 = 0;
 var $290 = 0, $291 = 0, $292 = 0, $293 = 0, $294 = 0, $295 = 0, $296 = 0, $297 = 0, $298 = 0, $299 = 0, $3 = 0, $30 = 0, $300 = 0, $301 = 0, $302 = 0, $303 = 0, $304 = 0, $305 = 0, $306 = 0, $307 = 0;
 var $308 = 0, $309 = 0, $31 = 0, $310 = 0, $311 = 0, $312 = 0, $313 = 0, $314 = 0, $315 = 0, $316 = 0, $317 = 0, $318 = 0, $319 = 0, $32 = 0, $320 = 0, $321 = 0, $322 = 0, $323 = 0, $324 = 0, $325 = 0;
 var $326 = 0, $327 = 0, $328 = 0, $329 = 0, $33 = 0, $330 = 0, $331 = 0, $332 = 0, $333 = 0, $334 = 0, $335 = 0, $336 = 0, $337 = 0, $338 = 0, $339 = 0, $34 = 0, $340 = 0, $341 = 0, $342 = 0, $343 = 0;
 var $344 = 0, $345 = 0, $346 = 0, $347 = 0, $348 = 0, $349 = 0, $35 = 0, $350 = 0, $351 = 0, $352 = 0, $353 = 0, $354 = 0, $355 = 0, $356 = 0, $357 = 0, $358 = 0, $359 = 0, $36 = 0, $360 = 0, $361 = 0;
 var $362 = 0, $363 = 0, $364 = 0, $365 = 0, $366 = 0, $367 = 0, $368 = 0, $369 = 0, $37 = 0, $370 = 0, $371 = 0, $372 = 0, $373 = 0, $374 = 0, $375 = 0, $376 = 0, $377 = 0, $378 = 0, $379 = 0, $38 = 0;
 var $380 = 0, $381 = 0, $382 = 0, $383 = 0, $384 = 0, $385 = 0, $386 = 0, $387 = 0, $388 = 0, $389 = 0, $39 = 0, $390 = 0, $391 = 0, $392 = 0, $393 = 0, $394 = 0, $395 = 0, $396 = 0, $397 = 0, $398 = 0;
 var $399 = 0, $4 = 0, $40 = 0, $400 = 0, $401 = 0, $402 = 0, $403 = 0, $404 = 0, $41 = 0, $42 = 0, $43 = 0, $44 = 0, $45 = 0, $46 = 0, $47 = 0, $48 = 0, $49 = 0, $5 = 0, $50 = 0, $51 = 0;
 var $52 = 0, $53 = 0, $54 = 0, $55 = 0, $56 = 0, $57 = 0, $58 = 0, $59 = 0, $6 = 0, $60 = 0, $61 = 0, $62 = 0, $63 = 0, $64 = 0, $65 = 0, $66 = 0, $67 = 0, $68 = 0, $69 = 0, $7 = 0;
 var $70 = 0, $71 = 0, $72 = 0, $73 = 0, $74 = 0, $75 = 0, $76 = 0, $77 = 0, $78 = 0, $79 = 0, $8 = 0, $80 = 0, $81 = 0, $82 = 0, $83 = 0, $84 = 0, $85 = 0, $86 = 0, $87 = 0, $88 = 0;
 var $89 = 0, $9 = 0, $90 = 0, $91 = 0, $92 = 0, $93 = 0, $94 = 0, $95 = 0, $96 = 0, $97 = 0, $98 = 0, $99 = 0, $vararg_buffer = 0, $vararg_buffer1 = 0, $vararg_buffer101 = 0, $vararg_buffer103 = 0, $vararg_buffer105 = 0, $vararg_buffer109 = 0, $vararg_buffer111 = 0, $vararg_buffer113 = 0;
 var $vararg_buffer117 = 0, $vararg_buffer119 = 0, $vararg_buffer121 = 0, $vararg_buffer125 = 0, $vararg_buffer127 = 0, $vararg_buffer129 = 0, $vararg_buffer13 = 0, $vararg_buffer133 = 0, $vararg_buffer135 = 0, $vararg_buffer137 = 0, $vararg_buffer141 = 0, $vararg_buffer143 = 0, $vararg_buffer145 = 0, $vararg_buffer149 = 0, $vararg_buffer15 = 0, $vararg_buffer151 = 0, $vararg_buffer153 = 0, $vararg_buffer157 = 0, $vararg_buffer159 = 0, $vararg_buffer161 = 0;
 var $vararg_buffer165 = 0, $vararg_buffer167 = 0, $vararg_buffer169 = 0, $vararg_buffer17 = 0, $vararg_buffer173 = 0, $vararg_buffer175 = 0, $vararg_buffer177 = 0, $vararg_buffer179 = 0, $vararg_buffer181 = 0, $vararg_buffer185 = 0, $vararg_buffer187 = 0, $vararg_buffer189 = 0, $vararg_buffer193 = 0, $vararg_buffer195 = 0, $vararg_buffer197 = 0, $vararg_buffer201 = 0, $vararg_buffer203 = 0, $vararg_buffer205 = 0, $vararg_buffer209 = 0, $vararg_buffer21 = 0;
 var $vararg_buffer211 = 0, $vararg_buffer214 = 0, $vararg_buffer219 = 0, $vararg_buffer221 = 0, $vararg_buffer23 = 0, $vararg_buffer25 = 0, $vararg_buffer27 = 0, $vararg_buffer29 = 0, $vararg_buffer3 = 0, $vararg_buffer31 = 0, $vararg_buffer33 = 0, $vararg_buffer37 = 0, $vararg_buffer39 = 0, $vararg_buffer41 = 0, $vararg_buffer45 = 0, $vararg_buffer47 = 0, $vararg_buffer49 = 0, $vararg_buffer5 = 0, $vararg_buffer53 = 0, $vararg_buffer55 = 0;
 var $vararg_buffer57 = 0, $vararg_buffer61 = 0, $vararg_buffer63 = 0, $vararg_buffer65 = 0, $vararg_buffer67 = 0, $vararg_buffer69 = 0, $vararg_buffer7 = 0, $vararg_buffer71 = 0, $vararg_buffer73 = 0, $vararg_buffer77 = 0, $vararg_buffer79 = 0, $vararg_buffer81 = 0, $vararg_buffer85 = 0, $vararg_buffer87 = 0, $vararg_buffer89 = 0, $vararg_buffer9 = 0, $vararg_buffer91 = 0, $vararg_buffer93 = 0, $vararg_buffer95 = 0, $vararg_buffer97 = 0;
 var $vararg_ptr100 = 0, $vararg_ptr108 = 0, $vararg_ptr116 = 0, $vararg_ptr12 = 0, $vararg_ptr124 = 0, $vararg_ptr132 = 0, $vararg_ptr140 = 0, $vararg_ptr148 = 0, $vararg_ptr156 = 0, $vararg_ptr164 = 0, $vararg_ptr172 = 0, $vararg_ptr184 = 0, $vararg_ptr192 = 0, $vararg_ptr20 = 0, $vararg_ptr200 = 0, $vararg_ptr208 = 0, $vararg_ptr217 = 0, $vararg_ptr218 = 0, $vararg_ptr36 = 0, $vararg_ptr44 = 0;
 var $vararg_ptr52 = 0, $vararg_ptr60 = 0, $vararg_ptr76 = 0, $vararg_ptr84 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 5232|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(5232|0);
 $$byval_copy251 = sp + 5220|0;
 $$byval_copy250 = sp + 5216|0;
 $$byval_copy249 = sp + 5212|0;
 $$byval_copy248 = sp + 5208|0;
 $$byval_copy247 = sp + 5204|0;
 $$byval_copy246 = sp + 5200|0;
 $$byval_copy245 = sp + 5196|0;
 $$byval_copy244 = sp + 5192|0;
 $$byval_copy243 = sp + 5188|0;
 $$byval_copy242 = sp + 5184|0;
 $$byval_copy241 = sp + 5180|0;
 $$byval_copy240 = sp + 5176|0;
 $$byval_copy239 = sp + 5172|0;
 $$byval_copy238 = sp + 5168|0;
 $$byval_copy237 = sp + 5164|0;
 $$byval_copy236 = sp + 5160|0;
 $$byval_copy235 = sp + 5156|0;
 $$byval_copy234 = sp + 5152|0;
 $$byval_copy233 = sp + 5148|0;
 $$byval_copy232 = sp + 5144|0;
 $$byval_copy231 = sp + 5140|0;
 $$byval_copy230 = sp + 5136|0;
 $$byval_copy229 = sp + 5132|0;
 $$byval_copy228 = sp + 5128|0;
 $$byval_copy227 = sp + 5124|0;
 $$byval_copy226 = sp + 5120|0;
 $$byval_copy225 = sp + 5116|0;
 $$byval_copy224 = sp + 5112|0;
 $$byval_copy223 = sp + 5108|0;
 $$byval_copy = sp + 5104|0;
 $vararg_buffer221 = sp + 704|0;
 $vararg_buffer219 = sp + 696|0;
 $vararg_buffer214 = sp + 680|0;
 $vararg_buffer211 = sp + 672|0;
 $vararg_buffer209 = sp + 664|0;
 $vararg_buffer205 = sp + 656|0;
 $vararg_buffer203 = sp + 648|0;
 $vararg_buffer201 = sp + 640|0;
 $vararg_buffer197 = sp + 632|0;
 $vararg_buffer195 = sp + 624|0;
 $vararg_buffer193 = sp + 616|0;
 $vararg_buffer189 = sp + 608|0;
 $vararg_buffer187 = sp + 600|0;
 $vararg_buffer185 = sp + 592|0;
 $vararg_buffer181 = sp + 584|0;
 $vararg_buffer179 = sp + 576|0;
 $vararg_buffer177 = sp + 568|0;
 $vararg_buffer175 = sp + 560|0;
 $vararg_buffer173 = sp + 552|0;
 $vararg_buffer169 = sp + 544|0;
 $vararg_buffer167 = sp + 536|0;
 $vararg_buffer165 = sp + 528|0;
 $vararg_buffer161 = sp + 520|0;
 $vararg_buffer159 = sp + 512|0;
 $vararg_buffer157 = sp + 504|0;
 $vararg_buffer153 = sp + 496|0;
 $vararg_buffer151 = sp + 488|0;
 $vararg_buffer149 = sp + 480|0;
 $vararg_buffer145 = sp + 472|0;
 $vararg_buffer143 = sp + 464|0;
 $vararg_buffer141 = sp + 456|0;
 $vararg_buffer137 = sp + 448|0;
 $vararg_buffer135 = sp + 440|0;
 $vararg_buffer133 = sp + 432|0;
 $vararg_buffer129 = sp + 424|0;
 $vararg_buffer127 = sp + 416|0;
 $vararg_buffer125 = sp + 408|0;
 $vararg_buffer121 = sp + 400|0;
 $vararg_buffer119 = sp + 392|0;
 $vararg_buffer117 = sp + 384|0;
 $vararg_buffer113 = sp + 376|0;
 $vararg_buffer111 = sp + 368|0;
 $vararg_buffer109 = sp + 360|0;
 $vararg_buffer105 = sp + 352|0;
 $vararg_buffer103 = sp + 344|0;
 $vararg_buffer101 = sp + 336|0;
 $vararg_buffer97 = sp + 328|0;
 $vararg_buffer95 = sp + 320|0;
 $vararg_buffer93 = sp + 312|0;
 $vararg_buffer91 = sp + 304|0;
 $vararg_buffer89 = sp + 296|0;
 $vararg_buffer87 = sp + 288|0;
 $vararg_buffer85 = sp + 280|0;
 $vararg_buffer81 = sp + 272|0;
 $vararg_buffer79 = sp + 264|0;
 $vararg_buffer77 = sp + 256|0;
 $vararg_buffer73 = sp + 248|0;
 $vararg_buffer71 = sp + 240|0;
 $vararg_buffer69 = sp + 232|0;
 $vararg_buffer67 = sp + 224|0;
 $vararg_buffer65 = sp + 216|0;
 $vararg_buffer63 = sp + 208|0;
 $vararg_buffer61 = sp + 200|0;
 $vararg_buffer57 = sp + 192|0;
 $vararg_buffer55 = sp + 184|0;
 $vararg_buffer53 = sp + 176|0;
 $vararg_buffer49 = sp + 168|0;
 $vararg_buffer47 = sp + 160|0;
 $vararg_buffer45 = sp + 152|0;
 $vararg_buffer41 = sp + 144|0;
 $vararg_buffer39 = sp + 136|0;
 $vararg_buffer37 = sp + 128|0;
 $vararg_buffer33 = sp + 120|0;
 $vararg_buffer31 = sp + 112|0;
 $vararg_buffer29 = sp + 104|0;
 $vararg_buffer27 = sp + 96|0;
 $vararg_buffer25 = sp + 88|0;
 $vararg_buffer23 = sp + 80|0;
 $vararg_buffer21 = sp + 72|0;
 $vararg_buffer17 = sp + 64|0;
 $vararg_buffer15 = sp + 56|0;
 $vararg_buffer13 = sp + 48|0;
 $vararg_buffer9 = sp + 40|0;
 $vararg_buffer7 = sp + 32|0;
 $vararg_buffer5 = sp + 24|0;
 $vararg_buffer3 = sp + 16|0;
 $vararg_buffer1 = sp + 8|0;
 $vararg_buffer = sp;
 $9 = sp + 5076|0;
 $13 = sp + 5060|0;
 $15 = sp + 5052|0;
 $16 = sp + 5048|0;
 $18 = sp + 5040|0;
 $21 = sp + 5028|0;
 $27 = sp + 5004|0;
 $28 = sp + 5000|0;
 $33 = sp + 4980|0;
 $34 = sp + 4976|0;
 $44 = sp + 4936|0;
 $47 = sp + 4924|0;
 $50 = sp + 4912|0;
 $53 = sp + 4900|0;
 $56 = sp + 4888|0;
 $59 = sp + 4876|0;
 $61 = sp + 740|0;
 $3 = $0;
 $4 = $1;
 $5 = $2;
 $6 = 3143;
 $7 = 0;
 $8 = 0;
 (_printf(2401,$vararg_buffer)|0);
 $70 = $6;
 HEAP32[$vararg_buffer1>>2] = $70;
 (_printf(2483,$vararg_buffer1)|0);
 $71 = $3;
 _fus_value_arr($9,$71);
 (_printf(3161,$vararg_buffer3)|0);
 $72 = $7;
 $73 = (($72) + 1)|0;
 $7 = $73;
 ;HEAP32[$$byval_copy>>2]=HEAP32[$9>>2]|0;
 $74 = (_fus_value_is_arr($$byval_copy)|0);
 if (!($74)) {
  (_printf(2565,$vararg_buffer5)|0);
  $75 = $8;
  $76 = (($75) + 1)|0;
  $8 = $76;
 }
 (_printf(3185,$vararg_buffer7)|0);
 $77 = $7;
 $78 = (($77) + 1)|0;
 $7 = $78;
 $79 = HEAP32[$9>>2]|0;
 $80 = ((($79)) + 8|0);
 $81 = HEAP32[$80>>2]|0;
 $10 = $81;
 $11 = 1;
 $82 = $10;
 $83 = $11;
 HEAP32[$vararg_buffer9>>2] = $82;
 $vararg_ptr12 = ((($vararg_buffer9)) + 4|0);
 HEAP32[$vararg_ptr12>>2] = $83;
 (_printf(3084,$vararg_buffer9)|0);
 $84 = $10;
 $85 = $11;
 $86 = ($84|0)==($85|0);
 if (!($86)) {
  (_printf(2565,$vararg_buffer13)|0);
  $87 = $8;
  $88 = (($87) + 1)|0;
  $8 = $88;
 }
 (_printf(3210,$vararg_buffer15)|0);
 $89 = $7;
 $90 = (($89) + 1)|0;
 $7 = $90;
 $91 = $3;
 $92 = $3;
 ;HEAP32[$$byval_copy223>>2]=HEAP32[$9>>2]|0;
 _fus_value_arr_len($13,$92,$$byval_copy223);
 ;HEAP32[$$byval_copy224>>2]=HEAP32[$13>>2]|0;
 $93 = (_fus_value_int_decode($91,$$byval_copy224)|0);
 $12 = $93;
 $14 = 0;
 $94 = $12;
 $95 = $14;
 HEAP32[$vararg_buffer17>>2] = $94;
 $vararg_ptr20 = ((($vararg_buffer17)) + 4|0);
 HEAP32[$vararg_ptr20>>2] = $95;
 (_printf(2549,$vararg_buffer17)|0);
 $96 = $12;
 $97 = $14;
 $98 = ($96|0)==($97|0);
 if (!($98)) {
  (_printf(2565,$vararg_buffer21)|0);
  $99 = $8;
  $100 = (($99) + 1)|0;
  $8 = $100;
 }
 ;HEAP32[$15>>2]=HEAP32[$9>>2]|0;
 $101 = $3;
 $102 = $3;
 _fus_value_int($16,$102,10);
 ;HEAP32[$$byval_copy225>>2]=HEAP32[$16>>2]|0;
 _fus_value_arr_push($101,$15,$$byval_copy225);
 (_printf(3270,$vararg_buffer23)|0);
 $103 = $7;
 $104 = (($103) + 1)|0;
 $7 = $104;
 ;HEAP32[$$byval_copy226>>2]=HEAP32[$15>>2]|0;
 $105 = (_fus_value_is_arr($$byval_copy226)|0);
 if (!($105)) {
  (_printf(2565,$vararg_buffer25)|0);
  $106 = $8;
  $107 = (($106) + 1)|0;
  $8 = $107;
 }
 (_printf(3295,$vararg_buffer27)|0);
 $108 = $7;
 $109 = (($108) + 1)|0;
 $7 = $109;
 $110 = HEAP32[$15>>2]|0;
 $111 = HEAP32[$9>>2]|0;
 $112 = ($110|0)==($111|0);
 if (!($112)) {
  (_printf(2565,$vararg_buffer29)|0);
  $113 = $8;
  $114 = (($113) + 1)|0;
  $8 = $114;
 }
 (_printf(3312,$vararg_buffer31)|0);
 $115 = $7;
 $116 = (($115) + 1)|0;
 $7 = $116;
 $117 = $3;
 $118 = $3;
 ;HEAP32[$$byval_copy227>>2]=HEAP32[$15>>2]|0;
 _fus_value_arr_len($18,$118,$$byval_copy227);
 ;HEAP32[$$byval_copy228>>2]=HEAP32[$18>>2]|0;
 $119 = (_fus_value_int_decode($117,$$byval_copy228)|0);
 $17 = $119;
 $19 = 1;
 $120 = $17;
 $121 = $19;
 HEAP32[$vararg_buffer33>>2] = $120;
 $vararg_ptr36 = ((($vararg_buffer33)) + 4|0);
 HEAP32[$vararg_ptr36>>2] = $121;
 (_printf(2549,$vararg_buffer33)|0);
 $122 = $17;
 $123 = $19;
 $124 = ($122|0)==($123|0);
 if (!($124)) {
  (_printf(2565,$vararg_buffer37)|0);
  $125 = $8;
  $126 = (($125) + 1)|0;
  $8 = $126;
 }
 (_printf(3373,$vararg_buffer39)|0);
 $127 = $7;
 $128 = (($127) + 1)|0;
 $7 = $128;
 $129 = $3;
 $130 = $3;
 ;HEAP32[$$byval_copy229>>2]=HEAP32[$15>>2]|0;
 _fus_value_arr_get_i($21,$130,$$byval_copy229,0);
 ;HEAP32[$$byval_copy230>>2]=HEAP32[$21>>2]|0;
 $131 = (_fus_value_int_decode($129,$$byval_copy230)|0);
 $20 = $131;
 $22 = 10;
 $132 = $20;
 $133 = $22;
 HEAP32[$vararg_buffer41>>2] = $132;
 $vararg_ptr44 = ((($vararg_buffer41)) + 4|0);
 HEAP32[$vararg_ptr44>>2] = $133;
 (_printf(2549,$vararg_buffer41)|0);
 $134 = $20;
 $135 = $22;
 $136 = ($134|0)==($135|0);
 if (!($136)) {
  (_printf(2565,$vararg_buffer45)|0);
  $137 = $8;
  $138 = (($137) + 1)|0;
  $8 = $138;
 }
 (_printf(3440,$vararg_buffer47)|0);
 $139 = $7;
 $140 = (($139) + 1)|0;
 $7 = $140;
 $141 = HEAP32[$15>>2]|0;
 $142 = ((($141)) + 8|0);
 $143 = HEAP32[$142>>2]|0;
 $23 = $143;
 $24 = 1;
 $144 = $23;
 $145 = $24;
 HEAP32[$vararg_buffer49>>2] = $144;
 $vararg_ptr52 = ((($vararg_buffer49)) + 4|0);
 HEAP32[$vararg_ptr52>>2] = $145;
 (_printf(3084,$vararg_buffer49)|0);
 $146 = $23;
 $147 = $24;
 $148 = ($146|0)==($147|0);
 if (!($148)) {
  (_printf(2565,$vararg_buffer53)|0);
  $149 = $8;
  $150 = (($149) + 1)|0;
  $8 = $150;
 }
 $151 = $3;
 ;HEAP32[$$byval_copy231>>2]=HEAP32[$15>>2]|0;
 _fus_value_attach($151,$$byval_copy231);
 $152 = $3;
 ;HEAP32[$$byval_copy232>>2]=HEAP32[$15>>2]|0;
 _fus_value_attach($152,$$byval_copy232);
 (_printf(3466,$vararg_buffer55)|0);
 $153 = $7;
 $154 = (($153) + 1)|0;
 $7 = $154;
 $155 = HEAP32[$15>>2]|0;
 $156 = ((($155)) + 8|0);
 $157 = HEAP32[$156>>2]|0;
 $25 = $157;
 $26 = 3;
 $158 = $25;
 $159 = $26;
 HEAP32[$vararg_buffer57>>2] = $158;
 $vararg_ptr60 = ((($vararg_buffer57)) + 4|0);
 HEAP32[$vararg_ptr60>>2] = $159;
 (_printf(3084,$vararg_buffer57)|0);
 $160 = $25;
 $161 = $26;
 $162 = ($160|0)==($161|0);
 if (!($162)) {
  (_printf(2565,$vararg_buffer61)|0);
  $163 = $8;
  $164 = (($163) + 1)|0;
  $8 = $164;
 }
 ;HEAP32[$27>>2]=HEAP32[$15>>2]|0;
 $165 = $3;
 $166 = $3;
 _fus_value_int($28,$166,20);
 ;HEAP32[$$byval_copy233>>2]=HEAP32[$28>>2]|0;
 _fus_value_arr_push($165,$27,$$byval_copy233);
 (_printf(3492,$vararg_buffer63)|0);
 $167 = $7;
 $168 = (($167) + 1)|0;
 $7 = $168;
 ;HEAP32[$$byval_copy234>>2]=HEAP32[$27>>2]|0;
 $169 = (_fus_value_is_arr($$byval_copy234)|0);
 if (!($169)) {
  (_printf(2565,$vararg_buffer65)|0);
  $170 = $8;
  $171 = (($170) + 1)|0;
  $8 = $171;
 }
 (_printf(3517,$vararg_buffer67)|0);
 $172 = $7;
 $173 = (($172) + 1)|0;
 $7 = $173;
 $174 = HEAP32[$27>>2]|0;
 $175 = HEAP32[$15>>2]|0;
 $176 = ($174|0)!=($175|0);
 if (!($176)) {
  (_printf(2565,$vararg_buffer69)|0);
  $177 = $8;
  $178 = (($177) + 1)|0;
  $8 = $178;
 }
 (_printf(3535,$vararg_buffer71)|0);
 $179 = $7;
 $180 = (($179) + 1)|0;
 $7 = $180;
 $181 = HEAP32[$15>>2]|0;
 $182 = ((($181)) + 8|0);
 $183 = HEAP32[$182>>2]|0;
 $29 = $183;
 $30 = 2;
 $184 = $29;
 $185 = $30;
 HEAP32[$vararg_buffer73>>2] = $184;
 $vararg_ptr76 = ((($vararg_buffer73)) + 4|0);
 HEAP32[$vararg_ptr76>>2] = $185;
 (_printf(3084,$vararg_buffer73)|0);
 $186 = $29;
 $187 = $30;
 $188 = ($186|0)==($187|0);
 if (!($188)) {
  (_printf(2565,$vararg_buffer77)|0);
  $189 = $8;
  $190 = (($189) + 1)|0;
  $8 = $190;
 }
 (_printf(3561,$vararg_buffer79)|0);
 $191 = $7;
 $192 = (($191) + 1)|0;
 $7 = $192;
 $193 = HEAP32[$27>>2]|0;
 $194 = ((($193)) + 8|0);
 $195 = HEAP32[$194>>2]|0;
 $31 = $195;
 $32 = 1;
 $196 = $31;
 $197 = $32;
 HEAP32[$vararg_buffer81>>2] = $196;
 $vararg_ptr84 = ((($vararg_buffer81)) + 4|0);
 HEAP32[$vararg_ptr84>>2] = $197;
 (_printf(3084,$vararg_buffer81)|0);
 $198 = $31;
 $199 = $32;
 $200 = ($198|0)==($199|0);
 if (!($200)) {
  (_printf(2565,$vararg_buffer85)|0);
  $201 = $8;
  $202 = (($201) + 1)|0;
  $8 = $202;
 }
 ;HEAP32[$33>>2]=HEAP32[$15>>2]|0;
 $203 = $3;
 _fus_value_arr_pop($203,$33,$34);
 (_printf(3587,$vararg_buffer87)|0);
 $204 = $7;
 $205 = (($204) + 1)|0;
 $7 = $205;
 ;HEAP32[$$byval_copy235>>2]=HEAP32[$33>>2]|0;
 $206 = (_fus_value_is_arr($$byval_copy235)|0);
 if (!($206)) {
  (_printf(2565,$vararg_buffer89)|0);
  $207 = $8;
  $208 = (($207) + 1)|0;
  $8 = $208;
 }
 (_printf(3612,$vararg_buffer91)|0);
 $209 = $7;
 $210 = (($209) + 1)|0;
 $7 = $210;
 $211 = HEAP32[$33>>2]|0;
 $212 = HEAP32[$27>>2]|0;
 $213 = ($211|0)!=($212|0);
 if (!($213)) {
  (_printf(2565,$vararg_buffer93)|0);
  $214 = $8;
  $215 = (($214) + 1)|0;
  $8 = $215;
 }
 (_printf(3630,$vararg_buffer95)|0);
 $216 = $7;
 $217 = (($216) + 1)|0;
 $7 = $217;
 $218 = $3;
 ;HEAP32[$$byval_copy236>>2]=HEAP32[$34>>2]|0;
 $219 = (_fus_value_int_decode($218,$$byval_copy236)|0);
 $35 = $219;
 $36 = 10;
 $220 = $35;
 $221 = $36;
 HEAP32[$vararg_buffer97>>2] = $220;
 $vararg_ptr100 = ((($vararg_buffer97)) + 4|0);
 HEAP32[$vararg_ptr100>>2] = $221;
 (_printf(2549,$vararg_buffer97)|0);
 $222 = $35;
 $223 = $36;
 $224 = ($222|0)==($223|0);
 if (!($224)) {
  (_printf(2565,$vararg_buffer101)|0);
  $225 = $8;
  $226 = (($225) + 1)|0;
  $8 = $226;
 }
 (_printf(3440,$vararg_buffer103)|0);
 $227 = $7;
 $228 = (($227) + 1)|0;
 $7 = $228;
 $229 = HEAP32[$15>>2]|0;
 $230 = ((($229)) + 8|0);
 $231 = HEAP32[$230>>2]|0;
 $37 = $231;
 $38 = 1;
 $232 = $37;
 $233 = $38;
 HEAP32[$vararg_buffer105>>2] = $232;
 $vararg_ptr108 = ((($vararg_buffer105)) + 4|0);
 HEAP32[$vararg_ptr108>>2] = $233;
 (_printf(3084,$vararg_buffer105)|0);
 $234 = $37;
 $235 = $38;
 $236 = ($234|0)==($235|0);
 if (!($236)) {
  (_printf(2565,$vararg_buffer109)|0);
  $237 = $8;
  $238 = (($237) + 1)|0;
  $8 = $238;
 }
 (_printf(3561,$vararg_buffer111)|0);
 $239 = $7;
 $240 = (($239) + 1)|0;
 $7 = $240;
 $241 = HEAP32[$27>>2]|0;
 $242 = ((($241)) + 8|0);
 $243 = HEAP32[$242>>2]|0;
 $39 = $243;
 $40 = 1;
 $244 = $39;
 $245 = $40;
 HEAP32[$vararg_buffer113>>2] = $244;
 $vararg_ptr116 = ((($vararg_buffer113)) + 4|0);
 HEAP32[$vararg_ptr116>>2] = $245;
 (_printf(3084,$vararg_buffer113)|0);
 $246 = $39;
 $247 = $40;
 $248 = ($246|0)==($247|0);
 if (!($248)) {
  (_printf(2565,$vararg_buffer117)|0);
  $249 = $8;
  $250 = (($249) + 1)|0;
  $8 = $250;
 }
 (_printf(3673,$vararg_buffer119)|0);
 $251 = $7;
 $252 = (($251) + 1)|0;
 $7 = $252;
 $253 = HEAP32[$33>>2]|0;
 $254 = ((($253)) + 8|0);
 $255 = HEAP32[$254>>2]|0;
 $41 = $255;
 $42 = 1;
 $256 = $41;
 $257 = $42;
 HEAP32[$vararg_buffer121>>2] = $256;
 $vararg_ptr124 = ((($vararg_buffer121)) + 4|0);
 HEAP32[$vararg_ptr124>>2] = $257;
 (_printf(3084,$vararg_buffer121)|0);
 $258 = $41;
 $259 = $42;
 $260 = ($258|0)==($259|0);
 if (!($260)) {
  (_printf(2565,$vararg_buffer125)|0);
  $261 = $8;
  $262 = (($261) + 1)|0;
  $8 = $262;
 }
 (_printf(3312,$vararg_buffer127)|0);
 $263 = $7;
 $264 = (($263) + 1)|0;
 $7 = $264;
 $265 = $3;
 $266 = $3;
 ;HEAP32[$$byval_copy237>>2]=HEAP32[$15>>2]|0;
 _fus_value_arr_len($44,$266,$$byval_copy237);
 ;HEAP32[$$byval_copy238>>2]=HEAP32[$44>>2]|0;
 $267 = (_fus_value_int_decode($265,$$byval_copy238)|0);
 $43 = $267;
 $45 = 1;
 $268 = $43;
 $269 = $45;
 HEAP32[$vararg_buffer129>>2] = $268;
 $vararg_ptr132 = ((($vararg_buffer129)) + 4|0);
 HEAP32[$vararg_ptr132>>2] = $269;
 (_printf(2549,$vararg_buffer129)|0);
 $270 = $43;
 $271 = $45;
 $272 = ($270|0)==($271|0);
 if (!($272)) {
  (_printf(2565,$vararg_buffer133)|0);
  $273 = $8;
  $274 = (($273) + 1)|0;
  $8 = $274;
 }
 (_printf(3373,$vararg_buffer135)|0);
 $275 = $7;
 $276 = (($275) + 1)|0;
 $7 = $276;
 $277 = $3;
 $278 = $3;
 ;HEAP32[$$byval_copy239>>2]=HEAP32[$15>>2]|0;
 _fus_value_arr_get_i($47,$278,$$byval_copy239,0);
 ;HEAP32[$$byval_copy240>>2]=HEAP32[$47>>2]|0;
 $279 = (_fus_value_int_decode($277,$$byval_copy240)|0);
 $46 = $279;
 $48 = 10;
 $280 = $46;
 $281 = $48;
 HEAP32[$vararg_buffer137>>2] = $280;
 $vararg_ptr140 = ((($vararg_buffer137)) + 4|0);
 HEAP32[$vararg_ptr140>>2] = $281;
 (_printf(2549,$vararg_buffer137)|0);
 $282 = $46;
 $283 = $48;
 $284 = ($282|0)==($283|0);
 if (!($284)) {
  (_printf(2565,$vararg_buffer141)|0);
  $285 = $8;
  $286 = (($285) + 1)|0;
  $8 = $286;
 }
 (_printf(3699,$vararg_buffer143)|0);
 $287 = $7;
 $288 = (($287) + 1)|0;
 $7 = $288;
 $289 = $3;
 $290 = $3;
 ;HEAP32[$$byval_copy241>>2]=HEAP32[$27>>2]|0;
 _fus_value_arr_len($50,$290,$$byval_copy241);
 ;HEAP32[$$byval_copy242>>2]=HEAP32[$50>>2]|0;
 $291 = (_fus_value_int_decode($289,$$byval_copy242)|0);
 $49 = $291;
 $51 = 2;
 $292 = $49;
 $293 = $51;
 HEAP32[$vararg_buffer145>>2] = $292;
 $vararg_ptr148 = ((($vararg_buffer145)) + 4|0);
 HEAP32[$vararg_ptr148>>2] = $293;
 (_printf(2549,$vararg_buffer145)|0);
 $294 = $49;
 $295 = $51;
 $296 = ($294|0)==($295|0);
 if (!($296)) {
  (_printf(2565,$vararg_buffer149)|0);
  $297 = $8;
  $298 = (($297) + 1)|0;
  $8 = $298;
 }
 (_printf(3760,$vararg_buffer151)|0);
 $299 = $7;
 $300 = (($299) + 1)|0;
 $7 = $300;
 $301 = $3;
 $302 = $3;
 ;HEAP32[$$byval_copy243>>2]=HEAP32[$27>>2]|0;
 _fus_value_arr_get_i($53,$302,$$byval_copy243,0);
 ;HEAP32[$$byval_copy244>>2]=HEAP32[$53>>2]|0;
 $303 = (_fus_value_int_decode($301,$$byval_copy244)|0);
 $52 = $303;
 $54 = 10;
 $304 = $52;
 $305 = $54;
 HEAP32[$vararg_buffer153>>2] = $304;
 $vararg_ptr156 = ((($vararg_buffer153)) + 4|0);
 HEAP32[$vararg_ptr156>>2] = $305;
 (_printf(2549,$vararg_buffer153)|0);
 $306 = $52;
 $307 = $54;
 $308 = ($306|0)==($307|0);
 if (!($308)) {
  (_printf(2565,$vararg_buffer157)|0);
  $309 = $8;
  $310 = (($309) + 1)|0;
  $8 = $310;
 }
 (_printf(3827,$vararg_buffer159)|0);
 $311 = $7;
 $312 = (($311) + 1)|0;
 $7 = $312;
 $313 = $3;
 $314 = $3;
 ;HEAP32[$$byval_copy245>>2]=HEAP32[$27>>2]|0;
 _fus_value_arr_get_i($56,$314,$$byval_copy245,1);
 ;HEAP32[$$byval_copy246>>2]=HEAP32[$56>>2]|0;
 $315 = (_fus_value_int_decode($313,$$byval_copy246)|0);
 $55 = $315;
 $57 = 20;
 $316 = $55;
 $317 = $57;
 HEAP32[$vararg_buffer161>>2] = $316;
 $vararg_ptr164 = ((($vararg_buffer161)) + 4|0);
 HEAP32[$vararg_ptr164>>2] = $317;
 (_printf(2549,$vararg_buffer161)|0);
 $318 = $55;
 $319 = $57;
 $320 = ($318|0)==($319|0);
 if (!($320)) {
  (_printf(2565,$vararg_buffer165)|0);
  $321 = $8;
  $322 = (($321) + 1)|0;
  $8 = $322;
 }
 (_printf(3894,$vararg_buffer167)|0);
 $323 = $7;
 $324 = (($323) + 1)|0;
 $7 = $324;
 $325 = $3;
 $326 = $3;
 ;HEAP32[$$byval_copy247>>2]=HEAP32[$33>>2]|0;
 _fus_value_arr_len($59,$326,$$byval_copy247);
 ;HEAP32[$$byval_copy248>>2]=HEAP32[$59>>2]|0;
 $327 = (_fus_value_int_decode($325,$$byval_copy248)|0);
 $58 = $327;
 $60 = 0;
 $328 = $58;
 $329 = $60;
 HEAP32[$vararg_buffer169>>2] = $328;
 $vararg_ptr172 = ((($vararg_buffer169)) + 4|0);
 HEAP32[$vararg_ptr172>>2] = $329;
 (_printf(2549,$vararg_buffer169)|0);
 $330 = $58;
 $331 = $60;
 $332 = ($330|0)==($331|0);
 if (!($332)) {
  (_printf(2565,$vararg_buffer173)|0);
  $333 = $8;
  $334 = (($333) + 1)|0;
  $8 = $334;
 }
 _fus_printer_init($61);
 (_printf(3955,$vararg_buffer175)|0);
 $335 = $3;
 $336 = HEAP32[$27>>2]|0;
 $337 = ((($336)) + 12|0);
 (_fus_printer_print_arr($61,$335,$337)|0);
 (_printf(3141,$vararg_buffer177)|0);
 _fus_printer_cleanup($61);
 (_printf(3970,$vararg_buffer179)|0);
 $338 = $7;
 $339 = (($338) + 1)|0;
 $7 = $339;
 $340 = $3;
 $341 = ((($340)) + 8|0);
 $342 = HEAP32[$341>>2]|0;
 $62 = $342;
 $63 = 3;
 $343 = $62;
 $344 = $63;
 HEAP32[$vararg_buffer181>>2] = $343;
 $vararg_ptr184 = ((($vararg_buffer181)) + 4|0);
 HEAP32[$vararg_ptr184>>2] = $344;
 (_printf(3084,$vararg_buffer181)|0);
 $345 = $62;
 $346 = $63;
 $347 = ($345|0)==($346|0);
 if (!($347)) {
  (_printf(2565,$vararg_buffer185)|0);
  $348 = $8;
  $349 = (($348) + 1)|0;
  $8 = $349;
 }
 $350 = $3;
 ;HEAP32[$$byval_copy249>>2]=HEAP32[$15>>2]|0;
 _fus_value_detach($350,$$byval_copy249);
 (_printf(3990,$vararg_buffer187)|0);
 $351 = $7;
 $352 = (($351) + 1)|0;
 $7 = $352;
 $353 = $3;
 $354 = ((($353)) + 8|0);
 $355 = HEAP32[$354>>2]|0;
 $64 = $355;
 $65 = 2;
 $356 = $64;
 $357 = $65;
 HEAP32[$vararg_buffer189>>2] = $356;
 $vararg_ptr192 = ((($vararg_buffer189)) + 4|0);
 HEAP32[$vararg_ptr192>>2] = $357;
 (_printf(3084,$vararg_buffer189)|0);
 $358 = $64;
 $359 = $65;
 $360 = ($358|0)==($359|0);
 if (!($360)) {
  (_printf(2565,$vararg_buffer193)|0);
  $361 = $8;
  $362 = (($361) + 1)|0;
  $8 = $362;
 }
 $363 = $3;
 ;HEAP32[$$byval_copy250>>2]=HEAP32[$27>>2]|0;
 _fus_value_detach($363,$$byval_copy250);
 (_printf(4010,$vararg_buffer195)|0);
 $364 = $7;
 $365 = (($364) + 1)|0;
 $7 = $365;
 $366 = $3;
 $367 = ((($366)) + 8|0);
 $368 = HEAP32[$367>>2]|0;
 $66 = $368;
 $67 = 1;
 $369 = $66;
 $370 = $67;
 HEAP32[$vararg_buffer197>>2] = $369;
 $vararg_ptr200 = ((($vararg_buffer197)) + 4|0);
 HEAP32[$vararg_ptr200>>2] = $370;
 (_printf(3084,$vararg_buffer197)|0);
 $371 = $66;
 $372 = $67;
 $373 = ($371|0)==($372|0);
 if (!($373)) {
  (_printf(2565,$vararg_buffer201)|0);
  $374 = $8;
  $375 = (($374) + 1)|0;
  $8 = $375;
 }
 $376 = $3;
 ;HEAP32[$$byval_copy251>>2]=HEAP32[$33>>2]|0;
 _fus_value_detach($376,$$byval_copy251);
 (_printf(3064,$vararg_buffer203)|0);
 $377 = $7;
 $378 = (($377) + 1)|0;
 $7 = $378;
 $379 = $3;
 $380 = ((($379)) + 8|0);
 $381 = HEAP32[$380>>2]|0;
 $68 = $381;
 $69 = 0;
 $382 = $68;
 $383 = $69;
 HEAP32[$vararg_buffer205>>2] = $382;
 $vararg_ptr208 = ((($vararg_buffer205)) + 4|0);
 HEAP32[$vararg_ptr208>>2] = $383;
 (_printf(3084,$vararg_buffer205)|0);
 $384 = $68;
 $385 = $69;
 $386 = ($384|0)==($385|0);
 if ($386) {
  $389 = $6;
  HEAP32[$vararg_buffer211>>2] = $389;
  (_printf(3098,$vararg_buffer211)|0);
  $390 = $7;
  $391 = $8;
  $392 = (($390) - ($391))|0;
  $393 = $7;
  $394 = $8;
  $395 = ($394|0)==(0);
  $396 = $395 ? 3107 : 3110;
  HEAP32[$vararg_buffer214>>2] = $392;
  $vararg_ptr217 = ((($vararg_buffer214)) + 4|0);
  HEAP32[$vararg_ptr217>>2] = $393;
  $vararg_ptr218 = ((($vararg_buffer214)) + 8|0);
  HEAP32[$vararg_ptr218>>2] = $396;
  (_printf(3115,$vararg_buffer214)|0);
  (_printf(2401,$vararg_buffer219)|0);
  (_printf(3141,$vararg_buffer221)|0);
  $397 = $7;
  $398 = $4;
  $399 = HEAP32[$398>>2]|0;
  $400 = (($399) + ($397))|0;
  HEAP32[$398>>2] = $400;
  $401 = $8;
  $402 = $5;
  $403 = HEAP32[$402>>2]|0;
  $404 = (($403) + ($401))|0;
  HEAP32[$402>>2] = $404;
  STACKTOP = sp;return;
 }
 (_printf(2565,$vararg_buffer209)|0);
 $387 = $8;
 $388 = (($387) + 1)|0;
 $8 = $388;
 $389 = $6;
 HEAP32[$vararg_buffer211>>2] = $389;
 (_printf(3098,$vararg_buffer211)|0);
 $390 = $7;
 $391 = $8;
 $392 = (($390) - ($391))|0;
 $393 = $7;
 $394 = $8;
 $395 = ($394|0)==(0);
 $396 = $395 ? 3107 : 3110;
 HEAP32[$vararg_buffer214>>2] = $392;
 $vararg_ptr217 = ((($vararg_buffer214)) + 4|0);
 HEAP32[$vararg_ptr217>>2] = $393;
 $vararg_ptr218 = ((($vararg_buffer214)) + 8|0);
 HEAP32[$vararg_ptr218>>2] = $396;
 (_printf(3115,$vararg_buffer214)|0);
 (_printf(2401,$vararg_buffer219)|0);
 (_printf(3141,$vararg_buffer221)|0);
 $397 = $7;
 $398 = $4;
 $399 = HEAP32[$398>>2]|0;
 $400 = (($399) + ($397))|0;
 HEAP32[$398>>2] = $400;
 $401 = $8;
 $402 = $5;
 $403 = HEAP32[$402>>2]|0;
 $404 = (($403) + ($401))|0;
 HEAP32[$402>>2] = $404;
 STACKTOP = sp;return;
}
function _run_arr_tests_medium($0,$1,$2) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 var $$byval_copy = 0, $$byval_copy63 = 0, $$byval_copy64 = 0, $$byval_copy65 = 0, $$byval_copy66 = 0, $$byval_copy67 = 0, $$byval_copy68 = 0, $$byval_copy69 = 0, $$byval_copy70 = 0, $$byval_copy71 = 0, $$byval_copy72 = 0, $$byval_copy73 = 0, $$byval_copy74 = 0, $$byval_copy75 = 0, $$byval_copy76 = 0, $10 = 0, $100 = 0, $101 = 0, $102 = 0, $103 = 0;
 var $104 = 0, $105 = 0, $106 = 0, $107 = 0, $108 = 0, $109 = 0, $11 = 0, $110 = 0, $111 = 0, $112 = 0, $113 = 0, $114 = 0, $115 = 0, $116 = 0, $117 = 0, $118 = 0, $119 = 0, $12 = 0, $120 = 0, $121 = 0;
 var $122 = 0, $123 = 0, $124 = 0, $125 = 0, $126 = 0, $127 = 0, $128 = 0, $129 = 0, $13 = 0, $130 = 0, $131 = 0, $132 = 0, $133 = 0, $134 = 0, $135 = 0, $136 = 0, $137 = 0, $138 = 0, $139 = 0, $14 = 0;
 var $140 = 0, $141 = 0, $142 = 0, $143 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0, $29 = 0, $3 = 0;
 var $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $4 = 0, $40 = 0, $41 = 0, $42 = 0, $43 = 0, $44 = 0, $45 = 0, $46 = 0, $47 = 0, $48 = 0;
 var $49 = 0, $5 = 0, $50 = 0, $51 = 0, $52 = 0, $53 = 0, $54 = 0, $55 = 0, $56 = 0, $57 = 0, $58 = 0, $59 = 0, $6 = 0, $60 = 0, $61 = 0, $62 = 0, $63 = 0, $64 = 0, $65 = 0, $66 = 0;
 var $67 = 0, $68 = 0, $69 = 0, $7 = 0, $70 = 0, $71 = 0, $72 = 0, $73 = 0, $74 = 0, $75 = 0, $76 = 0, $77 = 0, $78 = 0, $79 = 0, $8 = 0, $80 = 0, $81 = 0, $82 = 0, $83 = 0, $84 = 0;
 var $85 = 0, $86 = 0, $87 = 0, $88 = 0, $89 = 0, $9 = 0, $90 = 0, $91 = 0, $92 = 0, $93 = 0, $94 = 0, $95 = 0, $96 = 0, $97 = 0, $98 = 0, $99 = 0, $vararg_buffer = 0, $vararg_buffer1 = 0, $vararg_buffer11 = 0, $vararg_buffer13 = 0;
 var $vararg_buffer17 = 0, $vararg_buffer19 = 0, $vararg_buffer21 = 0, $vararg_buffer25 = 0, $vararg_buffer27 = 0, $vararg_buffer29 = 0, $vararg_buffer3 = 0, $vararg_buffer33 = 0, $vararg_buffer35 = 0, $vararg_buffer37 = 0, $vararg_buffer41 = 0, $vararg_buffer43 = 0, $vararg_buffer45 = 0, $vararg_buffer49 = 0, $vararg_buffer5 = 0, $vararg_buffer51 = 0, $vararg_buffer54 = 0, $vararg_buffer59 = 0, $vararg_buffer61 = 0, $vararg_buffer9 = 0;
 var $vararg_ptr16 = 0, $vararg_ptr24 = 0, $vararg_ptr32 = 0, $vararg_ptr40 = 0, $vararg_ptr48 = 0, $vararg_ptr57 = 0, $vararg_ptr58 = 0, $vararg_ptr8 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 368|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(368|0);
 $$byval_copy76 = sp + 364|0;
 $$byval_copy75 = sp + 360|0;
 $$byval_copy74 = sp + 356|0;
 $$byval_copy73 = sp + 352|0;
 $$byval_copy72 = sp + 348|0;
 $$byval_copy71 = sp + 344|0;
 $$byval_copy70 = sp + 340|0;
 $$byval_copy69 = sp + 336|0;
 $$byval_copy68 = sp + 332|0;
 $$byval_copy67 = sp + 328|0;
 $$byval_copy66 = sp + 324|0;
 $$byval_copy65 = sp + 320|0;
 $$byval_copy64 = sp + 316|0;
 $$byval_copy63 = sp + 312|0;
 $$byval_copy = sp + 308|0;
 $vararg_buffer61 = sp + 192|0;
 $vararg_buffer59 = sp + 184|0;
 $vararg_buffer54 = sp + 168|0;
 $vararg_buffer51 = sp + 160|0;
 $vararg_buffer49 = sp + 152|0;
 $vararg_buffer45 = sp + 144|0;
 $vararg_buffer43 = sp + 136|0;
 $vararg_buffer41 = sp + 128|0;
 $vararg_buffer37 = sp + 120|0;
 $vararg_buffer35 = sp + 112|0;
 $vararg_buffer33 = sp + 104|0;
 $vararg_buffer29 = sp + 96|0;
 $vararg_buffer27 = sp + 88|0;
 $vararg_buffer25 = sp + 80|0;
 $vararg_buffer21 = sp + 72|0;
 $vararg_buffer19 = sp + 64|0;
 $vararg_buffer17 = sp + 56|0;
 $vararg_buffer13 = sp + 48|0;
 $vararg_buffer11 = sp + 40|0;
 $vararg_buffer9 = sp + 32|0;
 $vararg_buffer5 = sp + 24|0;
 $vararg_buffer3 = sp + 16|0;
 $vararg_buffer1 = sp + 8|0;
 $vararg_buffer = sp;
 $9 = sp + 280|0;
 $10 = sp + 276|0;
 $11 = sp + 272|0;
 $12 = sp + 268|0;
 $17 = sp + 248|0;
 $18 = sp + 244|0;
 $19 = sp + 240|0;
 $20 = sp + 236|0;
 $21 = sp + 232|0;
 $22 = sp + 228|0;
 $3 = $0;
 $4 = $1;
 $5 = $2;
 $6 = 4030;
 $7 = 0;
 $8 = 0;
 (_printf(2401,$vararg_buffer)|0);
 $31 = $6;
 HEAP32[$vararg_buffer1>>2] = $31;
 (_printf(2483,$vararg_buffer1)|0);
 $32 = $3;
 _fus_value_arr($9,$32);
 $33 = $3;
 $34 = $3;
 _fus_value_int($10,$34,10);
 ;HEAP32[$$byval_copy>>2]=HEAP32[$10>>2]|0;
 _fus_value_arr_push($33,$9,$$byval_copy);
 $35 = $3;
 $36 = $3;
 _fus_value_int($11,$36,20);
 ;HEAP32[$$byval_copy63>>2]=HEAP32[$11>>2]|0;
 _fus_value_arr_push($35,$9,$$byval_copy63);
 $37 = $3;
 _fus_value_arr($12,$37);
 $38 = $3;
 ;HEAP32[$$byval_copy64>>2]=HEAP32[$9>>2]|0;
 _fus_value_arr_push($38,$12,$$byval_copy64);
 $39 = $3;
 ;HEAP32[$$byval_copy65>>2]=HEAP32[$9>>2]|0;
 _fus_value_arr_push($39,$12,$$byval_copy65);
 $40 = $3;
 ;HEAP32[$$byval_copy66>>2]=HEAP32[$9>>2]|0;
 _fus_value_attach($40,$$byval_copy66);
 (_printf(3990,$vararg_buffer3)|0);
 $41 = $7;
 $42 = (($41) + 1)|0;
 $7 = $42;
 $43 = $3;
 $44 = ((($43)) + 8|0);
 $45 = HEAP32[$44>>2]|0;
 $13 = $45;
 $14 = 2;
 $46 = $13;
 $47 = $14;
 HEAP32[$vararg_buffer5>>2] = $46;
 $vararg_ptr8 = ((($vararg_buffer5)) + 4|0);
 HEAP32[$vararg_ptr8>>2] = $47;
 (_printf(3084,$vararg_buffer5)|0);
 $48 = $13;
 $49 = $14;
 $50 = ($48|0)==($49|0);
 if (!($50)) {
  (_printf(2565,$vararg_buffer9)|0);
  $51 = $8;
  $52 = (($51) + 1)|0;
  $8 = $52;
 }
 $53 = $3;
 ;HEAP32[$$byval_copy67>>2]=HEAP32[$12>>2]|0;
 _fus_value_detach($53,$$byval_copy67);
 (_printf(3064,$vararg_buffer11)|0);
 $54 = $7;
 $55 = (($54) + 1)|0;
 $7 = $55;
 $56 = $3;
 $57 = ((($56)) + 8|0);
 $58 = HEAP32[$57>>2]|0;
 $15 = $58;
 $16 = 0;
 $59 = $15;
 $60 = $16;
 HEAP32[$vararg_buffer13>>2] = $59;
 $vararg_ptr16 = ((($vararg_buffer13)) + 4|0);
 HEAP32[$vararg_ptr16>>2] = $60;
 (_printf(3084,$vararg_buffer13)|0);
 $61 = $15;
 $62 = $16;
 $63 = ($61|0)==($62|0);
 if (!($63)) {
  (_printf(2565,$vararg_buffer17)|0);
  $64 = $8;
  $65 = (($64) + 1)|0;
  $8 = $65;
 }
 $66 = $3;
 _fus_value_arr($17,$66);
 $67 = $3;
 $68 = $3;
 _fus_value_int($18,$68,10);
 ;HEAP32[$$byval_copy68>>2]=HEAP32[$18>>2]|0;
 _fus_value_arr_push($67,$17,$$byval_copy68);
 $69 = $3;
 $70 = $3;
 _fus_value_int($19,$70,20);
 ;HEAP32[$$byval_copy69>>2]=HEAP32[$19>>2]|0;
 _fus_value_arr_push($69,$17,$$byval_copy69);
 $71 = $3;
 _fus_value_arr($20,$71);
 $72 = $3;
 ;HEAP32[$$byval_copy70>>2]=HEAP32[$17>>2]|0;
 _fus_value_arr_push($72,$20,$$byval_copy70);
 $73 = $3;
 ;HEAP32[$$byval_copy71>>2]=HEAP32[$17>>2]|0;
 _fus_value_arr_push($73,$20,$$byval_copy71);
 $74 = $3;
 ;HEAP32[$$byval_copy72>>2]=HEAP32[$17>>2]|0;
 _fus_value_attach($74,$$byval_copy72);
 ;HEAP32[$21>>2]=HEAP32[$20>>2]|0;
 $75 = $3;
 ;HEAP32[$$byval_copy73>>2]=HEAP32[$20>>2]|0;
 _fus_value_attach($75,$$byval_copy73);
 $76 = $3;
 _fus_value_arr_pop($76,$20,$22);
 (_printf(3970,$vararg_buffer19)|0);
 $77 = $7;
 $78 = (($77) + 1)|0;
 $7 = $78;
 $79 = $3;
 $80 = ((($79)) + 8|0);
 $81 = HEAP32[$80>>2]|0;
 $23 = $81;
 $24 = 3;
 $82 = $23;
 $83 = $24;
 HEAP32[$vararg_buffer21>>2] = $82;
 $vararg_ptr24 = ((($vararg_buffer21)) + 4|0);
 HEAP32[$vararg_ptr24>>2] = $83;
 (_printf(3084,$vararg_buffer21)|0);
 $84 = $23;
 $85 = $24;
 $86 = ($84|0)==($85|0);
 if (!($86)) {
  (_printf(2565,$vararg_buffer25)|0);
  $87 = $8;
  $88 = (($87) + 1)|0;
  $8 = $88;
 }
 $89 = $3;
 ;HEAP32[$$byval_copy74>>2]=HEAP32[$20>>2]|0;
 _fus_value_detach($89,$$byval_copy74);
 (_printf(3990,$vararg_buffer27)|0);
 $90 = $7;
 $91 = (($90) + 1)|0;
 $7 = $91;
 $92 = $3;
 $93 = ((($92)) + 8|0);
 $94 = HEAP32[$93>>2]|0;
 $25 = $94;
 $26 = 2;
 $95 = $25;
 $96 = $26;
 HEAP32[$vararg_buffer29>>2] = $95;
 $vararg_ptr32 = ((($vararg_buffer29)) + 4|0);
 HEAP32[$vararg_ptr32>>2] = $96;
 (_printf(3084,$vararg_buffer29)|0);
 $97 = $25;
 $98 = $26;
 $99 = ($97|0)==($98|0);
 if (!($99)) {
  (_printf(2565,$vararg_buffer33)|0);
  $100 = $8;
  $101 = (($100) + 1)|0;
  $8 = $101;
 }
 $102 = $3;
 ;HEAP32[$$byval_copy75>>2]=HEAP32[$21>>2]|0;
 _fus_value_detach($102,$$byval_copy75);
 (_printf(4010,$vararg_buffer35)|0);
 $103 = $7;
 $104 = (($103) + 1)|0;
 $7 = $104;
 $105 = $3;
 $106 = ((($105)) + 8|0);
 $107 = HEAP32[$106>>2]|0;
 $27 = $107;
 $28 = 1;
 $108 = $27;
 $109 = $28;
 HEAP32[$vararg_buffer37>>2] = $108;
 $vararg_ptr40 = ((($vararg_buffer37)) + 4|0);
 HEAP32[$vararg_ptr40>>2] = $109;
 (_printf(3084,$vararg_buffer37)|0);
 $110 = $27;
 $111 = $28;
 $112 = ($110|0)==($111|0);
 if (!($112)) {
  (_printf(2565,$vararg_buffer41)|0);
  $113 = $8;
  $114 = (($113) + 1)|0;
  $8 = $114;
 }
 $115 = $3;
 ;HEAP32[$$byval_copy76>>2]=HEAP32[$22>>2]|0;
 _fus_value_detach($115,$$byval_copy76);
 (_printf(3064,$vararg_buffer43)|0);
 $116 = $7;
 $117 = (($116) + 1)|0;
 $7 = $117;
 $118 = $3;
 $119 = ((($118)) + 8|0);
 $120 = HEAP32[$119>>2]|0;
 $29 = $120;
 $30 = 0;
 $121 = $29;
 $122 = $30;
 HEAP32[$vararg_buffer45>>2] = $121;
 $vararg_ptr48 = ((($vararg_buffer45)) + 4|0);
 HEAP32[$vararg_ptr48>>2] = $122;
 (_printf(3084,$vararg_buffer45)|0);
 $123 = $29;
 $124 = $30;
 $125 = ($123|0)==($124|0);
 if ($125) {
  $128 = $6;
  HEAP32[$vararg_buffer51>>2] = $128;
  (_printf(3098,$vararg_buffer51)|0);
  $129 = $7;
  $130 = $8;
  $131 = (($129) - ($130))|0;
  $132 = $7;
  $133 = $8;
  $134 = ($133|0)==(0);
  $135 = $134 ? 3107 : 3110;
  HEAP32[$vararg_buffer54>>2] = $131;
  $vararg_ptr57 = ((($vararg_buffer54)) + 4|0);
  HEAP32[$vararg_ptr57>>2] = $132;
  $vararg_ptr58 = ((($vararg_buffer54)) + 8|0);
  HEAP32[$vararg_ptr58>>2] = $135;
  (_printf(3115,$vararg_buffer54)|0);
  (_printf(2401,$vararg_buffer59)|0);
  (_printf(3141,$vararg_buffer61)|0);
  $136 = $7;
  $137 = $4;
  $138 = HEAP32[$137>>2]|0;
  $139 = (($138) + ($136))|0;
  HEAP32[$137>>2] = $139;
  $140 = $8;
  $141 = $5;
  $142 = HEAP32[$141>>2]|0;
  $143 = (($142) + ($140))|0;
  HEAP32[$141>>2] = $143;
  STACKTOP = sp;return;
 }
 (_printf(2565,$vararg_buffer49)|0);
 $126 = $8;
 $127 = (($126) + 1)|0;
 $8 = $127;
 $128 = $6;
 HEAP32[$vararg_buffer51>>2] = $128;
 (_printf(3098,$vararg_buffer51)|0);
 $129 = $7;
 $130 = $8;
 $131 = (($129) - ($130))|0;
 $132 = $7;
 $133 = $8;
 $134 = ($133|0)==(0);
 $135 = $134 ? 3107 : 3110;
 HEAP32[$vararg_buffer54>>2] = $131;
 $vararg_ptr57 = ((($vararg_buffer54)) + 4|0);
 HEAP32[$vararg_ptr57>>2] = $132;
 $vararg_ptr58 = ((($vararg_buffer54)) + 8|0);
 HEAP32[$vararg_ptr58>>2] = $135;
 (_printf(3115,$vararg_buffer54)|0);
 (_printf(2401,$vararg_buffer59)|0);
 (_printf(3141,$vararg_buffer61)|0);
 $136 = $7;
 $137 = $4;
 $138 = HEAP32[$137>>2]|0;
 $139 = (($138) + ($136))|0;
 HEAP32[$137>>2] = $139;
 $140 = $8;
 $141 = $5;
 $142 = HEAP32[$141>>2]|0;
 $143 = (($142) + ($140))|0;
 HEAP32[$141>>2] = $143;
 STACKTOP = sp;return;
}
function _run_arr_tests_uhhh($0,$1,$2) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 var $$byval_copy = 0, $$byval_copy55 = 0, $$byval_copy56 = 0, $$byval_copy57 = 0, $$byval_copy58 = 0, $$byval_copy59 = 0, $$byval_copy60 = 0, $$byval_copy61 = 0, $10 = 0, $100 = 0, $101 = 0, $102 = 0, $103 = 0, $104 = 0, $105 = 0, $106 = 0, $107 = 0, $108 = 0, $109 = 0, $11 = 0;
 var $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0, $29 = 0, $3 = 0, $30 = 0;
 var $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $4 = 0, $40 = 0, $41 = 0, $42 = 0, $43 = 0, $44 = 0, $45 = 0, $46 = 0, $47 = 0, $48 = 0, $49 = 0;
 var $5 = 0, $50 = 0, $51 = 0, $52 = 0, $53 = 0, $54 = 0, $55 = 0, $56 = 0, $57 = 0, $58 = 0, $59 = 0, $6 = 0, $60 = 0, $61 = 0, $62 = 0, $63 = 0, $64 = 0, $65 = 0, $66 = 0, $67 = 0;
 var $68 = 0, $69 = 0, $7 = 0, $70 = 0, $71 = 0, $72 = 0, $73 = 0, $74 = 0, $75 = 0, $76 = 0, $77 = 0, $78 = 0, $79 = 0, $8 = 0, $80 = 0, $81 = 0, $82 = 0, $83 = 0, $84 = 0, $85 = 0;
 var $86 = 0, $87 = 0, $88 = 0, $89 = 0, $9 = 0, $90 = 0, $91 = 0, $92 = 0, $93 = 0, $94 = 0, $95 = 0, $96 = 0, $97 = 0, $98 = 0, $99 = 0, $vararg_buffer = 0, $vararg_buffer1 = 0, $vararg_buffer11 = 0, $vararg_buffer13 = 0, $vararg_buffer17 = 0;
 var $vararg_buffer19 = 0, $vararg_buffer21 = 0, $vararg_buffer25 = 0, $vararg_buffer27 = 0, $vararg_buffer29 = 0, $vararg_buffer3 = 0, $vararg_buffer33 = 0, $vararg_buffer35 = 0, $vararg_buffer37 = 0, $vararg_buffer41 = 0, $vararg_buffer43 = 0, $vararg_buffer46 = 0, $vararg_buffer5 = 0, $vararg_buffer51 = 0, $vararg_buffer53 = 0, $vararg_buffer9 = 0, $vararg_ptr16 = 0, $vararg_ptr24 = 0, $vararg_ptr32 = 0, $vararg_ptr40 = 0;
 var $vararg_ptr49 = 0, $vararg_ptr50 = 0, $vararg_ptr8 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 288|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(288|0);
 $$byval_copy61 = sp + 280|0;
 $$byval_copy60 = sp + 276|0;
 $$byval_copy59 = sp + 272|0;
 $$byval_copy58 = sp + 268|0;
 $$byval_copy57 = sp + 264|0;
 $$byval_copy56 = sp + 260|0;
 $$byval_copy55 = sp + 256|0;
 $$byval_copy = sp + 252|0;
 $vararg_buffer53 = sp + 168|0;
 $vararg_buffer51 = sp + 160|0;
 $vararg_buffer46 = sp + 144|0;
 $vararg_buffer43 = sp + 136|0;
 $vararg_buffer41 = sp + 128|0;
 $vararg_buffer37 = sp + 120|0;
 $vararg_buffer35 = sp + 112|0;
 $vararg_buffer33 = sp + 104|0;
 $vararg_buffer29 = sp + 96|0;
 $vararg_buffer27 = sp + 88|0;
 $vararg_buffer25 = sp + 80|0;
 $vararg_buffer21 = sp + 72|0;
 $vararg_buffer19 = sp + 64|0;
 $vararg_buffer17 = sp + 56|0;
 $vararg_buffer13 = sp + 48|0;
 $vararg_buffer11 = sp + 40|0;
 $vararg_buffer9 = sp + 32|0;
 $vararg_buffer5 = sp + 24|0;
 $vararg_buffer3 = sp + 16|0;
 $vararg_buffer1 = sp + 8|0;
 $vararg_buffer = sp;
 $9 = sp + 224|0;
 $10 = sp + 220|0;
 $13 = sp + 208|0;
 $18 = sp + 188|0;
 $3 = $0;
 $4 = $1;
 $5 = $2;
 $6 = 4055;
 $7 = 0;
 $8 = 0;
 (_printf(2401,$vararg_buffer)|0);
 $23 = $6;
 HEAP32[$vararg_buffer1>>2] = $23;
 (_printf(2483,$vararg_buffer1)|0);
 $24 = $3;
 _fus_value_arr($9,$24);
 $25 = $3;
 _fus_value_arr($10,$25);
 $26 = $3;
 ;HEAP32[$$byval_copy>>2]=HEAP32[$10>>2]|0;
 _fus_value_arr_push($26,$9,$$byval_copy);
 $27 = $3;
 ;HEAP32[$$byval_copy55>>2]=HEAP32[$10>>2]|0;
 _fus_value_arr_push($27,$9,$$byval_copy55);
 $28 = $3;
 ;HEAP32[$$byval_copy56>>2]=HEAP32[$10>>2]|0;
 _fus_value_arr_push($28,$9,$$byval_copy56);
 $29 = $3;
 ;HEAP32[$$byval_copy57>>2]=HEAP32[$10>>2]|0;
 _fus_value_attach($29,$$byval_copy57);
 $30 = $3;
 ;HEAP32[$$byval_copy58>>2]=HEAP32[$10>>2]|0;
 _fus_value_attach($30,$$byval_copy58);
 (_printf(4089,$vararg_buffer3)|0);
 $31 = $7;
 $32 = (($31) + 1)|0;
 $7 = $32;
 $33 = HEAP32[$10>>2]|0;
 $34 = ((($33)) + 8|0);
 $35 = HEAP32[$34>>2]|0;
 $11 = $35;
 $12 = 3;
 $36 = $11;
 $37 = $12;
 HEAP32[$vararg_buffer5>>2] = $36;
 $vararg_ptr8 = ((($vararg_buffer5)) + 4|0);
 HEAP32[$vararg_ptr8>>2] = $37;
 (_printf(3084,$vararg_buffer5)|0);
 $38 = $11;
 $39 = $12;
 $40 = ($38|0)==($39|0);
 if (!($40)) {
  (_printf(2565,$vararg_buffer9)|0);
  $41 = $8;
  $42 = (($41) + 1)|0;
  $8 = $42;
 }
 $43 = $3;
 _fus_value_arr($13,$43);
 $44 = $3;
 ;HEAP32[$$byval_copy59>>2]=HEAP32[$13>>2]|0;
 _fus_value_arr_set_i($44,$9,1,$$byval_copy59);
 (_printf(4119,$vararg_buffer11)|0);
 $45 = $7;
 $46 = (($45) + 1)|0;
 $7 = $46;
 $47 = HEAP32[$13>>2]|0;
 $48 = ((($47)) + 8|0);
 $49 = HEAP32[$48>>2]|0;
 $14 = $49;
 $15 = 1;
 $50 = $14;
 $51 = $15;
 HEAP32[$vararg_buffer13>>2] = $50;
 $vararg_ptr16 = ((($vararg_buffer13)) + 4|0);
 HEAP32[$vararg_ptr16>>2] = $51;
 (_printf(3084,$vararg_buffer13)|0);
 $52 = $14;
 $53 = $15;
 $54 = ($52|0)==($53|0);
 if (!($54)) {
  (_printf(2565,$vararg_buffer17)|0);
  $55 = $8;
  $56 = (($55) + 1)|0;
  $8 = $56;
 }
 (_printf(4146,$vararg_buffer19)|0);
 $57 = $7;
 $58 = (($57) + 1)|0;
 $7 = $58;
 $59 = HEAP32[$10>>2]|0;
 $60 = ((($59)) + 8|0);
 $61 = HEAP32[$60>>2]|0;
 $16 = $61;
 $17 = 2;
 $62 = $16;
 $63 = $17;
 HEAP32[$vararg_buffer21>>2] = $62;
 $vararg_ptr24 = ((($vararg_buffer21)) + 4|0);
 HEAP32[$vararg_ptr24>>2] = $63;
 (_printf(3084,$vararg_buffer21)|0);
 $64 = $16;
 $65 = $17;
 $66 = ($64|0)==($65|0);
 if (!($66)) {
  (_printf(2565,$vararg_buffer25)|0);
  $67 = $8;
  $68 = (($67) + 1)|0;
  $8 = $68;
 }
 $69 = $3;
 ;HEAP32[$$byval_copy60>>2]=HEAP32[$9>>2]|0;
 _fus_value_arr_get_i($18,$69,$$byval_copy60,1);
 (_printf(4176,$vararg_buffer27)|0);
 $70 = $7;
 $71 = (($70) + 1)|0;
 $7 = $71;
 $72 = HEAP32[$13>>2]|0;
 $19 = $72;
 $73 = HEAP32[$18>>2]|0;
 $20 = $73;
 $74 = $19;
 $75 = $20;
 HEAP32[$vararg_buffer29>>2] = $74;
 $vararg_ptr32 = ((($vararg_buffer29)) + 4|0);
 HEAP32[$vararg_ptr32>>2] = $75;
 (_printf(4196,$vararg_buffer29)|0);
 $76 = $19;
 $77 = $20;
 $78 = ($76|0)==($77|0);
 if (!($78)) {
  (_printf(2565,$vararg_buffer33)|0);
  $79 = $8;
  $80 = (($79) + 1)|0;
  $8 = $80;
 }
 $81 = $3;
 ;HEAP32[$$byval_copy61>>2]=HEAP32[$9>>2]|0;
 _fus_value_detach($81,$$byval_copy61);
 (_printf(3064,$vararg_buffer35)|0);
 $82 = $7;
 $83 = (($82) + 1)|0;
 $7 = $83;
 $84 = $3;
 $85 = ((($84)) + 8|0);
 $86 = HEAP32[$85>>2]|0;
 $21 = $86;
 $22 = 0;
 $87 = $21;
 $88 = $22;
 HEAP32[$vararg_buffer37>>2] = $87;
 $vararg_ptr40 = ((($vararg_buffer37)) + 4|0);
 HEAP32[$vararg_ptr40>>2] = $88;
 (_printf(3084,$vararg_buffer37)|0);
 $89 = $21;
 $90 = $22;
 $91 = ($89|0)==($90|0);
 if ($91) {
  $94 = $6;
  HEAP32[$vararg_buffer43>>2] = $94;
  (_printf(3098,$vararg_buffer43)|0);
  $95 = $7;
  $96 = $8;
  $97 = (($95) - ($96))|0;
  $98 = $7;
  $99 = $8;
  $100 = ($99|0)==(0);
  $101 = $100 ? 3107 : 3110;
  HEAP32[$vararg_buffer46>>2] = $97;
  $vararg_ptr49 = ((($vararg_buffer46)) + 4|0);
  HEAP32[$vararg_ptr49>>2] = $98;
  $vararg_ptr50 = ((($vararg_buffer46)) + 8|0);
  HEAP32[$vararg_ptr50>>2] = $101;
  (_printf(3115,$vararg_buffer46)|0);
  (_printf(2401,$vararg_buffer51)|0);
  (_printf(3141,$vararg_buffer53)|0);
  $102 = $7;
  $103 = $4;
  $104 = HEAP32[$103>>2]|0;
  $105 = (($104) + ($102))|0;
  HEAP32[$103>>2] = $105;
  $106 = $8;
  $107 = $5;
  $108 = HEAP32[$107>>2]|0;
  $109 = (($108) + ($106))|0;
  HEAP32[$107>>2] = $109;
  STACKTOP = sp;return;
 }
 (_printf(2565,$vararg_buffer41)|0);
 $92 = $8;
 $93 = (($92) + 1)|0;
 $8 = $93;
 $94 = $6;
 HEAP32[$vararg_buffer43>>2] = $94;
 (_printf(3098,$vararg_buffer43)|0);
 $95 = $7;
 $96 = $8;
 $97 = (($95) - ($96))|0;
 $98 = $7;
 $99 = $8;
 $100 = ($99|0)==(0);
 $101 = $100 ? 3107 : 3110;
 HEAP32[$vararg_buffer46>>2] = $97;
 $vararg_ptr49 = ((($vararg_buffer46)) + 4|0);
 HEAP32[$vararg_ptr49>>2] = $98;
 $vararg_ptr50 = ((($vararg_buffer46)) + 8|0);
 HEAP32[$vararg_ptr50>>2] = $101;
 (_printf(3115,$vararg_buffer46)|0);
 (_printf(2401,$vararg_buffer51)|0);
 (_printf(3141,$vararg_buffer53)|0);
 $102 = $7;
 $103 = $4;
 $104 = HEAP32[$103>>2]|0;
 $105 = (($104) + ($102))|0;
 HEAP32[$103>>2] = $105;
 $106 = $8;
 $107 = $5;
 $108 = HEAP32[$107>>2]|0;
 $109 = (($108) + ($106))|0;
 HEAP32[$107>>2] = $109;
 STACKTOP = sp;return;
}
function _run_str_tests_basic($0,$1,$2) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 var $$byval_copy = 0, $$byval_copy39 = 0, $$byval_copy40 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0;
 var $27 = 0, $28 = 0, $29 = 0, $3 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $4 = 0, $40 = 0, $41 = 0, $42 = 0, $43 = 0, $44 = 0;
 var $45 = 0, $46 = 0, $47 = 0, $48 = 0, $49 = 0, $5 = 0, $50 = 0, $51 = 0, $52 = 0, $53 = 0, $54 = 0, $55 = 0, $56 = 0, $57 = 0, $58 = 0, $59 = 0, $6 = 0, $60 = 0, $61 = 0, $62 = 0;
 var $63 = 0, $64 = 0, $65 = 0, $66 = 0, $67 = 0, $68 = 0, $69 = 0, $7 = 0, $70 = 0, $71 = 0, $8 = 0, $9 = 0, $vararg_buffer = 0, $vararg_buffer1 = 0, $vararg_buffer11 = 0, $vararg_buffer13 = 0, $vararg_buffer17 = 0, $vararg_buffer19 = 0, $vararg_buffer21 = 0, $vararg_buffer25 = 0;
 var $vararg_buffer27 = 0, $vararg_buffer3 = 0, $vararg_buffer30 = 0, $vararg_buffer35 = 0, $vararg_buffer37 = 0, $vararg_buffer5 = 0, $vararg_buffer9 = 0, $vararg_ptr16 = 0, $vararg_ptr24 = 0, $vararg_ptr33 = 0, $vararg_ptr34 = 0, $vararg_ptr8 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 192|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(192|0);
 $$byval_copy40 = sp + 188|0;
 $$byval_copy39 = sp + 184|0;
 $$byval_copy = sp + 180|0;
 $vararg_buffer37 = sp + 120|0;
 $vararg_buffer35 = sp + 112|0;
 $vararg_buffer30 = sp + 96|0;
 $vararg_buffer27 = sp + 88|0;
 $vararg_buffer25 = sp + 80|0;
 $vararg_buffer21 = sp + 72|0;
 $vararg_buffer19 = sp + 64|0;
 $vararg_buffer17 = sp + 56|0;
 $vararg_buffer13 = sp + 48|0;
 $vararg_buffer11 = sp + 40|0;
 $vararg_buffer9 = sp + 32|0;
 $vararg_buffer5 = sp + 24|0;
 $vararg_buffer3 = sp + 16|0;
 $vararg_buffer1 = sp + 8|0;
 $vararg_buffer = sp;
 $9 = sp + 152|0;
 $10 = sp + 148|0;
 $3 = $0;
 $4 = $1;
 $5 = $2;
 $6 = 4210;
 $7 = 0;
 $8 = 0;
 (_printf(2401,$vararg_buffer)|0);
 $17 = $6;
 HEAP32[$vararg_buffer1>>2] = $17;
 (_printf(2483,$vararg_buffer1)|0);
 $18 = $3;
 _fus_value_str($9,$18,4220,3,0);
 $19 = $3;
 ;HEAP32[$$byval_copy>>2]=HEAP32[$9>>2]|0;
 _fus_value_str_len($10,$19,$$byval_copy);
 (_printf(4224,$vararg_buffer3)|0);
 $20 = $7;
 $21 = (($20) + 1)|0;
 $7 = $21;
 $22 = $3;
 ;HEAP32[$$byval_copy39>>2]=HEAP32[$10>>2]|0;
 $23 = (_fus_value_int_decode($22,$$byval_copy39)|0);
 $11 = $23;
 $12 = 3;
 $24 = $11;
 $25 = $12;
 HEAP32[$vararg_buffer5>>2] = $24;
 $vararg_ptr8 = ((($vararg_buffer5)) + 4|0);
 HEAP32[$vararg_ptr8>>2] = $25;
 (_printf(3084,$vararg_buffer5)|0);
 $26 = $11;
 $27 = $12;
 $28 = ($26|0)==($27|0);
 if (!($28)) {
  (_printf(2565,$vararg_buffer9)|0);
  $29 = $8;
  $30 = (($29) + 1)|0;
  $8 = $30;
 }
 (_printf(4010,$vararg_buffer11)|0);
 $31 = $7;
 $32 = (($31) + 1)|0;
 $7 = $32;
 $33 = $3;
 $34 = ((($33)) + 8|0);
 $35 = HEAP32[$34>>2]|0;
 $13 = $35;
 $14 = 1;
 $36 = $13;
 $37 = $14;
 HEAP32[$vararg_buffer13>>2] = $36;
 $vararg_ptr16 = ((($vararg_buffer13)) + 4|0);
 HEAP32[$vararg_ptr16>>2] = $37;
 (_printf(3084,$vararg_buffer13)|0);
 $38 = $13;
 $39 = $14;
 $40 = ($38|0)==($39|0);
 if (!($40)) {
  (_printf(2565,$vararg_buffer17)|0);
  $41 = $8;
  $42 = (($41) + 1)|0;
  $8 = $42;
 }
 $43 = $3;
 ;HEAP32[$$byval_copy40>>2]=HEAP32[$9>>2]|0;
 _fus_value_detach($43,$$byval_copy40);
 (_printf(3064,$vararg_buffer19)|0);
 $44 = $7;
 $45 = (($44) + 1)|0;
 $7 = $45;
 $46 = $3;
 $47 = ((($46)) + 8|0);
 $48 = HEAP32[$47>>2]|0;
 $15 = $48;
 $16 = 0;
 $49 = $15;
 $50 = $16;
 HEAP32[$vararg_buffer21>>2] = $49;
 $vararg_ptr24 = ((($vararg_buffer21)) + 4|0);
 HEAP32[$vararg_ptr24>>2] = $50;
 (_printf(3084,$vararg_buffer21)|0);
 $51 = $15;
 $52 = $16;
 $53 = ($51|0)==($52|0);
 if (!($53)) {
  (_printf(2565,$vararg_buffer25)|0);
  $54 = $8;
  $55 = (($54) + 1)|0;
  $8 = $55;
 }
 $56 = $6;
 HEAP32[$vararg_buffer27>>2] = $56;
 (_printf(3098,$vararg_buffer27)|0);
 $57 = $7;
 $58 = $8;
 $59 = (($57) - ($58))|0;
 $60 = $7;
 $61 = $8;
 $62 = ($61|0)==(0);
 $63 = $62 ? 3107 : 3110;
 HEAP32[$vararg_buffer30>>2] = $59;
 $vararg_ptr33 = ((($vararg_buffer30)) + 4|0);
 HEAP32[$vararg_ptr33>>2] = $60;
 $vararg_ptr34 = ((($vararg_buffer30)) + 8|0);
 HEAP32[$vararg_ptr34>>2] = $63;
 (_printf(3115,$vararg_buffer30)|0);
 (_printf(2401,$vararg_buffer35)|0);
 (_printf(3141,$vararg_buffer37)|0);
 $64 = $7;
 $65 = $4;
 $66 = HEAP32[$65>>2]|0;
 $67 = (($66) + ($64))|0;
 HEAP32[$65>>2] = $67;
 $68 = $8;
 $69 = $5;
 $70 = HEAP32[$69>>2]|0;
 $71 = (($70) + ($68))|0;
 HEAP32[$69>>2] = $71;
 STACKTOP = sp;return;
}
function _run_lexer_tests($0,$1,$2) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 var $10 = 0, $100 = 0, $101 = 0, $102 = 0, $103 = 0, $104 = 0, $105 = 0, $106 = 0, $107 = 0, $108 = 0, $109 = 0, $11 = 0, $110 = 0, $111 = 0, $112 = 0, $113 = 0, $114 = 0, $115 = 0, $116 = 0, $117 = 0;
 var $118 = 0, $119 = 0, $12 = 0, $120 = 0, $121 = 0, $122 = 0, $123 = 0, $124 = 0, $125 = 0, $126 = 0, $127 = 0, $128 = 0, $129 = 0, $13 = 0, $130 = 0, $131 = 0, $132 = 0, $133 = 0, $134 = 0, $135 = 0;
 var $136 = 0, $137 = 0, $138 = 0, $139 = 0, $14 = 0, $140 = 0, $141 = 0, $142 = 0, $143 = 0, $144 = 0, $145 = 0, $146 = 0, $147 = 0, $148 = 0, $149 = 0, $15 = 0, $150 = 0, $151 = 0, $152 = 0, $153 = 0;
 var $154 = 0, $155 = 0, $156 = 0, $157 = 0, $158 = 0, $159 = 0, $16 = 0, $160 = 0, $161 = 0, $162 = 0, $163 = 0, $164 = 0, $165 = 0, $166 = 0, $167 = 0, $168 = 0, $169 = 0, $17 = 0, $170 = 0, $171 = 0;
 var $172 = 0, $173 = 0, $174 = 0, $175 = 0, $176 = 0, $177 = 0, $178 = 0, $179 = 0, $18 = 0, $180 = 0, $181 = 0, $182 = 0, $183 = 0, $184 = 0, $185 = 0, $186 = 0, $187 = 0, $188 = 0, $189 = 0, $19 = 0;
 var $190 = 0, $191 = 0, $192 = 0, $193 = 0, $194 = 0, $195 = 0, $196 = 0, $197 = 0, $198 = 0, $199 = 0, $20 = 0, $200 = 0, $201 = 0, $202 = 0, $203 = 0, $204 = 0, $205 = 0, $206 = 0, $207 = 0, $208 = 0;
 var $209 = 0, $21 = 0, $210 = 0, $211 = 0, $212 = 0, $213 = 0, $214 = 0, $215 = 0, $216 = 0, $217 = 0, $218 = 0, $219 = 0, $22 = 0, $220 = 0, $221 = 0, $222 = 0, $223 = 0, $224 = 0, $225 = 0, $226 = 0;
 var $227 = 0, $228 = 0, $229 = 0, $23 = 0, $230 = 0, $231 = 0, $232 = 0, $233 = 0, $234 = 0, $235 = 0, $236 = 0, $237 = 0, $238 = 0, $239 = 0, $24 = 0, $240 = 0, $241 = 0, $242 = 0, $243 = 0, $244 = 0;
 var $245 = 0, $246 = 0, $247 = 0, $248 = 0, $249 = 0, $25 = 0, $250 = 0, $251 = 0, $252 = 0, $253 = 0, $254 = 0, $255 = 0, $256 = 0, $257 = 0, $258 = 0, $259 = 0, $26 = 0, $260 = 0, $261 = 0, $262 = 0;
 var $263 = 0, $264 = 0, $265 = 0, $266 = 0, $267 = 0, $268 = 0, $269 = 0, $27 = 0, $270 = 0, $271 = 0, $272 = 0, $273 = 0, $274 = 0, $275 = 0, $276 = 0, $277 = 0, $278 = 0, $279 = 0, $28 = 0, $280 = 0;
 var $281 = 0, $282 = 0, $283 = 0, $284 = 0, $285 = 0, $286 = 0, $287 = 0, $288 = 0, $289 = 0, $29 = 0, $290 = 0, $291 = 0, $292 = 0, $293 = 0, $294 = 0, $295 = 0, $296 = 0, $297 = 0, $298 = 0, $299 = 0;
 var $3 = 0, $30 = 0, $300 = 0, $301 = 0, $302 = 0, $303 = 0, $304 = 0, $305 = 0, $306 = 0, $307 = 0, $308 = 0, $309 = 0, $31 = 0, $310 = 0, $311 = 0, $312 = 0, $313 = 0, $314 = 0, $315 = 0, $316 = 0;
 var $317 = 0, $318 = 0, $319 = 0, $32 = 0, $320 = 0, $321 = 0, $322 = 0, $323 = 0, $324 = 0, $325 = 0, $326 = 0, $327 = 0, $328 = 0, $329 = 0, $33 = 0, $330 = 0, $331 = 0, $332 = 0, $333 = 0, $334 = 0;
 var $335 = 0, $336 = 0, $337 = 0, $338 = 0, $339 = 0, $34 = 0, $340 = 0, $341 = 0, $342 = 0, $343 = 0, $344 = 0, $345 = 0, $346 = 0, $347 = 0, $348 = 0, $349 = 0, $35 = 0, $350 = 0, $351 = 0, $352 = 0;
 var $353 = 0, $354 = 0, $355 = 0, $356 = 0, $357 = 0, $358 = 0, $359 = 0, $36 = 0, $360 = 0, $361 = 0, $362 = 0, $363 = 0, $364 = 0, $365 = 0, $366 = 0, $367 = 0, $368 = 0, $369 = 0, $37 = 0, $370 = 0;
 var $371 = 0, $372 = 0, $373 = 0, $374 = 0, $375 = 0, $376 = 0, $377 = 0, $378 = 0, $379 = 0, $38 = 0, $380 = 0, $381 = 0, $382 = 0, $383 = 0, $384 = 0, $385 = 0, $386 = 0, $387 = 0, $388 = 0, $389 = 0;
 var $39 = 0, $390 = 0, $391 = 0, $392 = 0, $393 = 0, $394 = 0, $395 = 0, $396 = 0, $397 = 0, $398 = 0, $399 = 0, $4 = 0, $40 = 0, $400 = 0, $401 = 0, $402 = 0, $403 = 0, $404 = 0, $405 = 0, $406 = 0;
 var $407 = 0, $408 = 0, $409 = 0, $41 = 0, $410 = 0, $411 = 0, $412 = 0, $413 = 0, $414 = 0, $415 = 0, $416 = 0, $417 = 0, $418 = 0, $419 = 0, $42 = 0, $420 = 0, $421 = 0, $422 = 0, $423 = 0, $424 = 0;
 var $425 = 0, $426 = 0, $427 = 0, $428 = 0, $429 = 0, $43 = 0, $430 = 0, $431 = 0, $432 = 0, $433 = 0, $434 = 0, $435 = 0, $436 = 0, $437 = 0, $438 = 0, $439 = 0, $44 = 0, $440 = 0, $441 = 0, $442 = 0;
 var $443 = 0, $444 = 0, $445 = 0, $446 = 0, $447 = 0, $448 = 0, $449 = 0, $45 = 0, $450 = 0, $451 = 0, $452 = 0, $453 = 0, $454 = 0, $455 = 0, $456 = 0, $457 = 0, $458 = 0, $459 = 0, $46 = 0, $460 = 0;
 var $461 = 0, $462 = 0, $463 = 0, $464 = 0, $465 = 0, $466 = 0, $467 = 0, $468 = 0, $469 = 0, $47 = 0, $470 = 0, $471 = 0, $472 = 0, $473 = 0, $474 = 0, $475 = 0, $476 = 0, $477 = 0, $478 = 0, $479 = 0;
 var $48 = 0, $480 = 0, $481 = 0, $482 = 0, $483 = 0, $484 = 0, $485 = 0, $486 = 0, $487 = 0, $488 = 0, $489 = 0, $49 = 0, $490 = 0, $491 = 0, $492 = 0, $493 = 0, $494 = 0, $495 = 0, $496 = 0, $497 = 0;
 var $498 = 0, $499 = 0, $5 = 0, $50 = 0, $500 = 0, $501 = 0, $502 = 0, $503 = 0, $504 = 0, $505 = 0, $506 = 0, $507 = 0, $508 = 0, $509 = 0, $51 = 0, $510 = 0, $511 = 0, $512 = 0, $513 = 0, $514 = 0;
 var $515 = 0, $516 = 0, $517 = 0, $518 = 0, $519 = 0, $52 = 0, $520 = 0, $521 = 0, $522 = 0, $523 = 0, $524 = 0, $525 = 0, $526 = 0, $527 = 0, $528 = 0, $529 = 0, $53 = 0, $530 = 0, $531 = 0, $532 = 0;
 var $533 = 0, $534 = 0, $535 = 0, $536 = 0, $537 = 0, $538 = 0, $539 = 0, $54 = 0, $540 = 0, $541 = 0, $542 = 0, $543 = 0, $544 = 0, $545 = 0, $546 = 0, $547 = 0, $548 = 0, $549 = 0, $55 = 0, $550 = 0;
 var $551 = 0, $552 = 0, $553 = 0, $554 = 0, $555 = 0, $556 = 0, $557 = 0, $558 = 0, $559 = 0, $56 = 0, $560 = 0, $561 = 0, $562 = 0, $563 = 0, $564 = 0, $565 = 0, $566 = 0, $567 = 0, $568 = 0, $569 = 0;
 var $57 = 0, $570 = 0, $571 = 0, $572 = 0, $573 = 0, $574 = 0, $575 = 0, $576 = 0, $577 = 0, $578 = 0, $579 = 0, $58 = 0, $580 = 0, $581 = 0, $582 = 0, $583 = 0, $584 = 0, $585 = 0, $586 = 0, $587 = 0;
 var $588 = 0, $589 = 0, $59 = 0, $590 = 0, $591 = 0, $592 = 0, $593 = 0, $594 = 0, $595 = 0, $596 = 0, $597 = 0, $598 = 0, $599 = 0, $6 = 0, $60 = 0, $600 = 0, $601 = 0, $602 = 0, $603 = 0, $604 = 0;
 var $605 = 0, $606 = 0, $61 = 0, $62 = 0, $63 = 0, $64 = 0, $65 = 0, $66 = 0, $67 = 0, $68 = 0, $69 = 0, $7 = 0, $70 = 0, $71 = 0, $72 = 0, $73 = 0, $74 = 0, $75 = 0, $76 = 0, $77 = 0;
 var $78 = 0, $79 = 0, $8 = 0, $80 = 0, $81 = 0, $82 = 0, $83 = 0, $84 = 0, $85 = 0, $86 = 0, $87 = 0, $88 = 0, $89 = 0, $9 = 0, $90 = 0, $91 = 0, $92 = 0, $93 = 0, $94 = 0, $95 = 0;
 var $96 = 0, $97 = 0, $98 = 0, $99 = 0, $vararg_buffer = 0, $vararg_buffer1 = 0, $vararg_buffer103 = 0, $vararg_buffer105 = 0, $vararg_buffer107 = 0, $vararg_buffer109 = 0, $vararg_buffer11 = 0, $vararg_buffer111 = 0, $vararg_buffer115 = 0, $vararg_buffer117 = 0, $vararg_buffer119 = 0, $vararg_buffer121 = 0, $vararg_buffer123 = 0, $vararg_buffer127 = 0, $vararg_buffer129 = 0, $vararg_buffer13 = 0;
 var $vararg_buffer131 = 0, $vararg_buffer133 = 0, $vararg_buffer135 = 0, $vararg_buffer139 = 0, $vararg_buffer141 = 0, $vararg_buffer143 = 0, $vararg_buffer145 = 0, $vararg_buffer147 = 0, $vararg_buffer15 = 0, $vararg_buffer151 = 0, $vararg_buffer153 = 0, $vararg_buffer155 = 0, $vararg_buffer157 = 0, $vararg_buffer159 = 0, $vararg_buffer163 = 0, $vararg_buffer165 = 0, $vararg_buffer167 = 0, $vararg_buffer169 = 0, $vararg_buffer17 = 0, $vararg_buffer171 = 0;
 var $vararg_buffer175 = 0, $vararg_buffer177 = 0, $vararg_buffer179 = 0, $vararg_buffer181 = 0, $vararg_buffer183 = 0, $vararg_buffer187 = 0, $vararg_buffer189 = 0, $vararg_buffer19 = 0, $vararg_buffer191 = 0, $vararg_buffer193 = 0, $vararg_buffer195 = 0, $vararg_buffer199 = 0, $vararg_buffer201 = 0, $vararg_buffer203 = 0, $vararg_buffer205 = 0, $vararg_buffer207 = 0, $vararg_buffer21 = 0, $vararg_buffer211 = 0, $vararg_buffer213 = 0, $vararg_buffer215 = 0;
 var $vararg_buffer217 = 0, $vararg_buffer219 = 0, $vararg_buffer223 = 0, $vararg_buffer225 = 0, $vararg_buffer227 = 0, $vararg_buffer229 = 0, $vararg_buffer23 = 0, $vararg_buffer231 = 0, $vararg_buffer235 = 0, $vararg_buffer237 = 0, $vararg_buffer239 = 0, $vararg_buffer241 = 0, $vararg_buffer243 = 0, $vararg_buffer247 = 0, $vararg_buffer249 = 0, $vararg_buffer25 = 0, $vararg_buffer251 = 0, $vararg_buffer253 = 0, $vararg_buffer255 = 0, $vararg_buffer259 = 0;
 var $vararg_buffer261 = 0, $vararg_buffer263 = 0, $vararg_buffer265 = 0, $vararg_buffer267 = 0, $vararg_buffer27 = 0, $vararg_buffer271 = 0, $vararg_buffer273 = 0, $vararg_buffer275 = 0, $vararg_buffer277 = 0, $vararg_buffer279 = 0, $vararg_buffer283 = 0, $vararg_buffer285 = 0, $vararg_buffer287 = 0, $vararg_buffer289 = 0, $vararg_buffer29 = 0, $vararg_buffer291 = 0, $vararg_buffer295 = 0, $vararg_buffer297 = 0, $vararg_buffer299 = 0, $vararg_buffer3 = 0;
 var $vararg_buffer301 = 0, $vararg_buffer303 = 0, $vararg_buffer307 = 0, $vararg_buffer309 = 0, $vararg_buffer31 = 0, $vararg_buffer311 = 0, $vararg_buffer313 = 0, $vararg_buffer315 = 0, $vararg_buffer319 = 0, $vararg_buffer321 = 0, $vararg_buffer323 = 0, $vararg_buffer325 = 0, $vararg_buffer327 = 0, $vararg_buffer33 = 0, $vararg_buffer331 = 0, $vararg_buffer333 = 0, $vararg_buffer335 = 0, $vararg_buffer337 = 0, $vararg_buffer339 = 0, $vararg_buffer343 = 0;
 var $vararg_buffer345 = 0, $vararg_buffer347 = 0, $vararg_buffer349 = 0, $vararg_buffer35 = 0, $vararg_buffer351 = 0, $vararg_buffer355 = 0, $vararg_buffer357 = 0, $vararg_buffer359 = 0, $vararg_buffer361 = 0, $vararg_buffer363 = 0, $vararg_buffer367 = 0, $vararg_buffer369 = 0, $vararg_buffer37 = 0, $vararg_buffer371 = 0, $vararg_buffer373 = 0, $vararg_buffer375 = 0, $vararg_buffer379 = 0, $vararg_buffer381 = 0, $vararg_buffer383 = 0, $vararg_buffer385 = 0;
 var $vararg_buffer388 = 0, $vararg_buffer39 = 0, $vararg_buffer393 = 0, $vararg_buffer395 = 0, $vararg_buffer41 = 0, $vararg_buffer43 = 0, $vararg_buffer45 = 0, $vararg_buffer47 = 0, $vararg_buffer49 = 0, $vararg_buffer5 = 0, $vararg_buffer51 = 0, $vararg_buffer55 = 0, $vararg_buffer57 = 0, $vararg_buffer59 = 0, $vararg_buffer61 = 0, $vararg_buffer63 = 0, $vararg_buffer67 = 0, $vararg_buffer69 = 0, $vararg_buffer7 = 0, $vararg_buffer71 = 0;
 var $vararg_buffer73 = 0, $vararg_buffer75 = 0, $vararg_buffer79 = 0, $vararg_buffer81 = 0, $vararg_buffer83 = 0, $vararg_buffer85 = 0, $vararg_buffer87 = 0, $vararg_buffer9 = 0, $vararg_buffer91 = 0, $vararg_buffer93 = 0, $vararg_buffer95 = 0, $vararg_buffer97 = 0, $vararg_buffer99 = 0, $vararg_ptr102 = 0, $vararg_ptr114 = 0, $vararg_ptr126 = 0, $vararg_ptr138 = 0, $vararg_ptr150 = 0, $vararg_ptr162 = 0, $vararg_ptr174 = 0;
 var $vararg_ptr186 = 0, $vararg_ptr198 = 0, $vararg_ptr210 = 0, $vararg_ptr222 = 0, $vararg_ptr234 = 0, $vararg_ptr246 = 0, $vararg_ptr258 = 0, $vararg_ptr270 = 0, $vararg_ptr282 = 0, $vararg_ptr294 = 0, $vararg_ptr306 = 0, $vararg_ptr318 = 0, $vararg_ptr330 = 0, $vararg_ptr342 = 0, $vararg_ptr354 = 0, $vararg_ptr366 = 0, $vararg_ptr378 = 0, $vararg_ptr391 = 0, $vararg_ptr392 = 0, $vararg_ptr54 = 0;
 var $vararg_ptr66 = 0, $vararg_ptr78 = 0, $vararg_ptr90 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 3520|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(3520|0);
 $vararg_buffer395 = sp + 1352|0;
 $vararg_buffer393 = sp + 1344|0;
 $vararg_buffer388 = sp + 1328|0;
 $vararg_buffer385 = sp + 1320|0;
 $vararg_buffer383 = sp + 1312|0;
 $vararg_buffer381 = sp + 1304|0;
 $vararg_buffer379 = sp + 1296|0;
 $vararg_buffer375 = sp + 1288|0;
 $vararg_buffer373 = sp + 1280|0;
 $vararg_buffer371 = sp + 1272|0;
 $vararg_buffer369 = sp + 1264|0;
 $vararg_buffer367 = sp + 1256|0;
 $vararg_buffer363 = sp + 1248|0;
 $vararg_buffer361 = sp + 1240|0;
 $vararg_buffer359 = sp + 1232|0;
 $vararg_buffer357 = sp + 1224|0;
 $vararg_buffer355 = sp + 1216|0;
 $vararg_buffer351 = sp + 1208|0;
 $vararg_buffer349 = sp + 1200|0;
 $vararg_buffer347 = sp + 1192|0;
 $vararg_buffer345 = sp + 1184|0;
 $vararg_buffer343 = sp + 1176|0;
 $vararg_buffer339 = sp + 1168|0;
 $vararg_buffer337 = sp + 1160|0;
 $vararg_buffer335 = sp + 1152|0;
 $vararg_buffer333 = sp + 1144|0;
 $vararg_buffer331 = sp + 1136|0;
 $vararg_buffer327 = sp + 1128|0;
 $vararg_buffer325 = sp + 1120|0;
 $vararg_buffer323 = sp + 1112|0;
 $vararg_buffer321 = sp + 1104|0;
 $vararg_buffer319 = sp + 1096|0;
 $vararg_buffer315 = sp + 1088|0;
 $vararg_buffer313 = sp + 1080|0;
 $vararg_buffer311 = sp + 1072|0;
 $vararg_buffer309 = sp + 1064|0;
 $vararg_buffer307 = sp + 1056|0;
 $vararg_buffer303 = sp + 1048|0;
 $vararg_buffer301 = sp + 1040|0;
 $vararg_buffer299 = sp + 1032|0;
 $vararg_buffer297 = sp + 1024|0;
 $vararg_buffer295 = sp + 1016|0;
 $vararg_buffer291 = sp + 1008|0;
 $vararg_buffer289 = sp + 1000|0;
 $vararg_buffer287 = sp + 992|0;
 $vararg_buffer285 = sp + 984|0;
 $vararg_buffer283 = sp + 976|0;
 $vararg_buffer279 = sp + 968|0;
 $vararg_buffer277 = sp + 960|0;
 $vararg_buffer275 = sp + 952|0;
 $vararg_buffer273 = sp + 944|0;
 $vararg_buffer271 = sp + 936|0;
 $vararg_buffer267 = sp + 928|0;
 $vararg_buffer265 = sp + 920|0;
 $vararg_buffer263 = sp + 912|0;
 $vararg_buffer261 = sp + 904|0;
 $vararg_buffer259 = sp + 896|0;
 $vararg_buffer255 = sp + 888|0;
 $vararg_buffer253 = sp + 880|0;
 $vararg_buffer251 = sp + 872|0;
 $vararg_buffer249 = sp + 864|0;
 $vararg_buffer247 = sp + 856|0;
 $vararg_buffer243 = sp + 848|0;
 $vararg_buffer241 = sp + 840|0;
 $vararg_buffer239 = sp + 832|0;
 $vararg_buffer237 = sp + 824|0;
 $vararg_buffer235 = sp + 816|0;
 $vararg_buffer231 = sp + 808|0;
 $vararg_buffer229 = sp + 800|0;
 $vararg_buffer227 = sp + 792|0;
 $vararg_buffer225 = sp + 784|0;
 $vararg_buffer223 = sp + 776|0;
 $vararg_buffer219 = sp + 768|0;
 $vararg_buffer217 = sp + 760|0;
 $vararg_buffer215 = sp + 752|0;
 $vararg_buffer213 = sp + 744|0;
 $vararg_buffer211 = sp + 736|0;
 $vararg_buffer207 = sp + 728|0;
 $vararg_buffer205 = sp + 720|0;
 $vararg_buffer203 = sp + 712|0;
 $vararg_buffer201 = sp + 704|0;
 $vararg_buffer199 = sp + 696|0;
 $vararg_buffer195 = sp + 688|0;
 $vararg_buffer193 = sp + 680|0;
 $vararg_buffer191 = sp + 672|0;
 $vararg_buffer189 = sp + 664|0;
 $vararg_buffer187 = sp + 656|0;
 $vararg_buffer183 = sp + 648|0;
 $vararg_buffer181 = sp + 640|0;
 $vararg_buffer179 = sp + 632|0;
 $vararg_buffer177 = sp + 624|0;
 $vararg_buffer175 = sp + 616|0;
 $vararg_buffer171 = sp + 608|0;
 $vararg_buffer169 = sp + 600|0;
 $vararg_buffer167 = sp + 592|0;
 $vararg_buffer165 = sp + 584|0;
 $vararg_buffer163 = sp + 576|0;
 $vararg_buffer159 = sp + 568|0;
 $vararg_buffer157 = sp + 560|0;
 $vararg_buffer155 = sp + 552|0;
 $vararg_buffer153 = sp + 544|0;
 $vararg_buffer151 = sp + 536|0;
 $vararg_buffer147 = sp + 528|0;
 $vararg_buffer145 = sp + 520|0;
 $vararg_buffer143 = sp + 512|0;
 $vararg_buffer141 = sp + 504|0;
 $vararg_buffer139 = sp + 496|0;
 $vararg_buffer135 = sp + 488|0;
 $vararg_buffer133 = sp + 480|0;
 $vararg_buffer131 = sp + 472|0;
 $vararg_buffer129 = sp + 464|0;
 $vararg_buffer127 = sp + 456|0;
 $vararg_buffer123 = sp + 448|0;
 $vararg_buffer121 = sp + 440|0;
 $vararg_buffer119 = sp + 432|0;
 $vararg_buffer117 = sp + 424|0;
 $vararg_buffer115 = sp + 416|0;
 $vararg_buffer111 = sp + 408|0;
 $vararg_buffer109 = sp + 400|0;
 $vararg_buffer107 = sp + 392|0;
 $vararg_buffer105 = sp + 384|0;
 $vararg_buffer103 = sp + 376|0;
 $vararg_buffer99 = sp + 368|0;
 $vararg_buffer97 = sp + 360|0;
 $vararg_buffer95 = sp + 352|0;
 $vararg_buffer93 = sp + 344|0;
 $vararg_buffer91 = sp + 336|0;
 $vararg_buffer87 = sp + 328|0;
 $vararg_buffer85 = sp + 320|0;
 $vararg_buffer83 = sp + 312|0;
 $vararg_buffer81 = sp + 304|0;
 $vararg_buffer79 = sp + 296|0;
 $vararg_buffer75 = sp + 288|0;
 $vararg_buffer73 = sp + 280|0;
 $vararg_buffer71 = sp + 272|0;
 $vararg_buffer69 = sp + 264|0;
 $vararg_buffer67 = sp + 256|0;
 $vararg_buffer63 = sp + 248|0;
 $vararg_buffer61 = sp + 240|0;
 $vararg_buffer59 = sp + 232|0;
 $vararg_buffer57 = sp + 224|0;
 $vararg_buffer55 = sp + 216|0;
 $vararg_buffer51 = sp + 208|0;
 $vararg_buffer49 = sp + 200|0;
 $vararg_buffer47 = sp + 192|0;
 $vararg_buffer45 = sp + 184|0;
 $vararg_buffer43 = sp + 176|0;
 $vararg_buffer41 = sp + 168|0;
 $vararg_buffer39 = sp + 160|0;
 $vararg_buffer37 = sp + 152|0;
 $vararg_buffer35 = sp + 144|0;
 $vararg_buffer33 = sp + 136|0;
 $vararg_buffer31 = sp + 128|0;
 $vararg_buffer29 = sp + 120|0;
 $vararg_buffer27 = sp + 112|0;
 $vararg_buffer25 = sp + 104|0;
 $vararg_buffer23 = sp + 96|0;
 $vararg_buffer21 = sp + 88|0;
 $vararg_buffer19 = sp + 80|0;
 $vararg_buffer17 = sp + 72|0;
 $vararg_buffer15 = sp + 64|0;
 $vararg_buffer13 = sp + 56|0;
 $vararg_buffer11 = sp + 48|0;
 $vararg_buffer9 = sp + 40|0;
 $vararg_buffer7 = sp + 32|0;
 $vararg_buffer5 = sp + 24|0;
 $vararg_buffer3 = sp + 16|0;
 $vararg_buffer1 = sp + 8|0;
 $vararg_buffer = sp;
 $9 = sp + 3180|0;
 $11 = sp + 2860|0;
 $13 = sp + 2540|0;
 $15 = sp + 2220|0;
 $17 = sp + 1900|0;
 $19 = sp + 1580|0;
 $3 = $0;
 $4 = $1;
 $5 = $2;
 $6 = 4265;
 $7 = 0;
 $8 = 0;
 (_printf(2401,$vararg_buffer)|0);
 $76 = $6;
 HEAP32[$vararg_buffer1>>2] = $76;
 (_printf(2483,$vararg_buffer1)|0);
 _fus_lexer_init($9,0);
 (_printf(4277,$vararg_buffer3)|0);
 $10 = 4311;
 _fus_lexer_init($11,0);
 $77 = $10;
 $78 = $10;
 $79 = (_strlen($78)|0);
 $80 = (($79) + 1)|0;
 _fus_lexer_load_chunk($11,$77,$80);
 while(1) {
  $81 = (_fus_lexer_is_ok($11)|0);
  if (!($81)) {
   break;
  }
  _fus_lexer_next($11);
 }
 (_printf(4423,$vararg_buffer5)|0);
 $82 = $7;
 $83 = (($82) + 1)|0;
 $7 = $83;
 $84 = (_fus_lexer_is_done($11)|0);
 if (!($84)) {
  (_printf(2565,$vararg_buffer7)|0);
  $85 = $8;
  $86 = (($85) + 1)|0;
  $8 = $86;
 }
 (_printf(4452,$vararg_buffer9)|0);
 $87 = $7;
 $88 = (($87) + 1)|0;
 $7 = $88;
 $89 = (_fus_lexer_got($11,11164)|0);
 if (!($89)) {
  (_printf(2565,$vararg_buffer11)|0);
  $90 = $8;
  $91 = (($90) + 1)|0;
  $8 = $91;
 }
 _fus_lexer_cleanup($11);
 (_printf(4481,$vararg_buffer13)|0);
 $12 = 4311;
 _fus_lexer_init($13,0);
 $92 = $12;
 $93 = $12;
 $94 = (_strlen($93)|0);
 _fus_lexer_load_chunk($13,$92,$94);
 _fus_lexer_mark_final($13);
 while(1) {
  $95 = (_fus_lexer_is_ok($13)|0);
  if (!($95)) {
   break;
  }
  _fus_lexer_next($13);
 }
 (_printf(4423,$vararg_buffer15)|0);
 $96 = $7;
 $97 = (($96) + 1)|0;
 $7 = $97;
 $98 = (_fus_lexer_is_done($13)|0);
 if (!($98)) {
  (_printf(2565,$vararg_buffer17)|0);
  $99 = $8;
  $100 = (($99) + 1)|0;
  $8 = $100;
 }
 (_printf(4452,$vararg_buffer19)|0);
 $101 = $7;
 $102 = (($101) + 1)|0;
 $7 = $102;
 $103 = (_fus_lexer_got($13,11164)|0);
 if (!($103)) {
  (_printf(2565,$vararg_buffer21)|0);
  $104 = $8;
  $105 = (($104) + 1)|0;
  $8 = $105;
 }
 _fus_lexer_cleanup($13);
 (_printf(4521,$vararg_buffer23)|0);
 $14 = 4564;
 _fus_lexer_init($15,0);
 $106 = $14;
 $107 = $14;
 $108 = (_strlen($107)|0);
 _fus_lexer_load_chunk($15,$106,$108);
 while(1) {
  $109 = (_fus_lexer_is_ok($15)|0);
  if (!($109)) {
   break;
  }
  _fus_lexer_next($15);
 }
 (_printf(4677,$vararg_buffer25)|0);
 $110 = $7;
 $111 = (($110) + 1)|0;
 $7 = $111;
 $112 = (_fus_lexer_is_split($15)|0);
 if (!($112)) {
  (_printf(2565,$vararg_buffer27)|0);
  $113 = $8;
  $114 = (($113) + 1)|0;
  $8 = $114;
 }
 (_printf(4452,$vararg_buffer29)|0);
 $115 = $7;
 $116 = (($115) + 1)|0;
 $7 = $116;
 $117 = (_fus_lexer_got($15,11164)|0);
 if (!($117)) {
  (_printf(2565,$vararg_buffer31)|0);
  $118 = $8;
  $119 = (($118) + 1)|0;
  $8 = $119;
 }
 _fus_lexer_cleanup($15);
 (_printf(4707,$vararg_buffer33)|0);
 $16 = 4311;
 _fus_lexer_init($17,0);
 $120 = $16;
 $121 = $16;
 $122 = (_strlen($121)|0);
 _fus_lexer_load_chunk($17,$120,$122);
 while(1) {
  $123 = (_fus_lexer_is_ok($17)|0);
  if (!($123)) {
   break;
  }
  _fus_lexer_next($17);
 }
 (_printf(4677,$vararg_buffer35)|0);
 $124 = $7;
 $125 = (($124) + 1)|0;
 $7 = $125;
 $126 = (_fus_lexer_is_split($17)|0);
 if (!($126)) {
  (_printf(2565,$vararg_buffer37)|0);
  $127 = $8;
  $128 = (($127) + 1)|0;
  $8 = $128;
 }
 (_printf(4754,$vararg_buffer39)|0);
 $129 = $7;
 $130 = (($129) + 1)|0;
 $7 = $130;
 $131 = (_fus_lexer_got($17,4789)|0);
 if (!($131)) {
  (_printf(2565,$vararg_buffer41)|0);
  $132 = $8;
  $133 = (($132) + 1)|0;
  $8 = $133;
 }
 _fus_lexer_cleanup($17);
 (_printf(4796,$vararg_buffer43)|0);
 $18 = 4311;
 _fus_lexer_init($19,0);
 $134 = $18;
 $135 = $18;
 $136 = (_strlen($135)|0);
 $137 = (($136) + 1)|0;
 _fus_lexer_load_chunk($19,$134,$137);
 (_printf(4830,$vararg_buffer45)|0);
 $138 = $7;
 $139 = (($138) + 1)|0;
 $7 = $139;
 $140 = (_fus_lexer_got($19,4862)|0);
 if (!($140)) {
  (_printf(2565,$vararg_buffer47)|0);
  $141 = $8;
  $142 = (($141) + 1)|0;
  $8 = $142;
 }
 (_printf(4866,$vararg_buffer49)|0);
 $143 = $7;
 $144 = (($143) + 1)|0;
 $7 = $144;
 $145 = ((($19)) + 308|0);
 $146 = HEAP32[$145>>2]|0;
 $20 = $146;
 $21 = 3;
 $147 = $20;
 $148 = $21;
 HEAP32[$vararg_buffer51>>2] = $147;
 $vararg_ptr54 = ((($vararg_buffer51)) + 4|0);
 HEAP32[$vararg_ptr54>>2] = $148;
 (_printf(3084,$vararg_buffer51)|0);
 $149 = $20;
 $150 = $21;
 $151 = ($149|0)==($150|0);
 if (!($151)) {
  (_printf(2565,$vararg_buffer55)|0);
  $152 = $8;
  $153 = (($152) + 1)|0;
  $8 = $153;
 }
 _fus_lexer_next($19);
 (_printf(4903,$vararg_buffer57)|0);
 $154 = $7;
 $155 = (($154) + 1)|0;
 $7 = $155;
 $156 = (_fus_lexer_got($19,4936)|0);
 if (!($156)) {
  (_printf(2565,$vararg_buffer59)|0);
  $157 = $8;
  $158 = (($157) + 1)|0;
  $8 = $158;
 }
 (_printf(4866,$vararg_buffer61)|0);
 $159 = $7;
 $160 = (($159) + 1)|0;
 $7 = $160;
 $161 = ((($19)) + 308|0);
 $162 = HEAP32[$161>>2]|0;
 $22 = $162;
 $23 = 3;
 $163 = $22;
 $164 = $23;
 HEAP32[$vararg_buffer63>>2] = $163;
 $vararg_ptr66 = ((($vararg_buffer63)) + 4|0);
 HEAP32[$vararg_ptr66>>2] = $164;
 (_printf(3084,$vararg_buffer63)|0);
 $165 = $22;
 $166 = $23;
 $167 = ($165|0)==($166|0);
 if (!($167)) {
  (_printf(2565,$vararg_buffer67)|0);
  $168 = $8;
  $169 = (($168) + 1)|0;
  $8 = $169;
 }
 _fus_lexer_next($19);
 (_printf(4941,$vararg_buffer69)|0);
 $170 = $7;
 $171 = (($170) + 1)|0;
 $7 = $171;
 $172 = (_fus_lexer_got($19,4971)|0);
 if (!($172)) {
  (_printf(2565,$vararg_buffer71)|0);
  $173 = $8;
  $174 = (($173) + 1)|0;
  $8 = $174;
 }
 (_printf(4973,$vararg_buffer73)|0);
 $175 = $7;
 $176 = (($175) + 1)|0;
 $7 = $176;
 $177 = ((($19)) + 308|0);
 $178 = HEAP32[$177>>2]|0;
 $24 = $178;
 $25 = 5;
 $179 = $24;
 $180 = $25;
 HEAP32[$vararg_buffer75>>2] = $179;
 $vararg_ptr78 = ((($vararg_buffer75)) + 4|0);
 HEAP32[$vararg_ptr78>>2] = $180;
 (_printf(3084,$vararg_buffer75)|0);
 $181 = $24;
 $182 = $25;
 $183 = ($181|0)==($182|0);
 if (!($183)) {
  (_printf(2565,$vararg_buffer79)|0);
  $184 = $8;
  $185 = (($184) + 1)|0;
  $8 = $185;
 }
 _fus_lexer_next($19);
 (_printf(5015,$vararg_buffer81)|0);
 $186 = $7;
 $187 = (($186) + 1)|0;
 $7 = $187;
 $188 = (_fus_lexer_got($19,5047)|0);
 if (!($188)) {
  (_printf(2565,$vararg_buffer83)|0);
  $189 = $8;
  $190 = (($189) + 1)|0;
  $8 = $190;
 }
 (_printf(4866,$vararg_buffer85)|0);
 $191 = $7;
 $192 = (($191) + 1)|0;
 $7 = $192;
 $193 = ((($19)) + 308|0);
 $194 = HEAP32[$193>>2]|0;
 $26 = $194;
 $27 = 3;
 $195 = $26;
 $196 = $27;
 HEAP32[$vararg_buffer87>>2] = $195;
 $vararg_ptr90 = ((($vararg_buffer87)) + 4|0);
 HEAP32[$vararg_ptr90>>2] = $196;
 (_printf(3084,$vararg_buffer87)|0);
 $197 = $26;
 $198 = $27;
 $199 = ($197|0)==($198|0);
 if (!($199)) {
  (_printf(2565,$vararg_buffer91)|0);
  $200 = $8;
  $201 = (($200) + 1)|0;
  $8 = $201;
 }
 _fus_lexer_next($19);
 (_printf(5051,$vararg_buffer93)|0);
 $202 = $7;
 $203 = (($202) + 1)|0;
 $7 = $203;
 $204 = (_fus_lexer_got($19,5090)|0);
 if (!($204)) {
  (_printf(2565,$vararg_buffer95)|0);
  $205 = $8;
  $206 = (($205) + 1)|0;
  $8 = $206;
 }
 (_printf(5099,$vararg_buffer97)|0);
 $207 = $7;
 $208 = (($207) + 1)|0;
 $7 = $208;
 $209 = ((($19)) + 308|0);
 $210 = HEAP32[$209>>2]|0;
 $28 = $210;
 $29 = 4;
 $211 = $28;
 $212 = $29;
 HEAP32[$vararg_buffer99>>2] = $211;
 $vararg_ptr102 = ((($vararg_buffer99)) + 4|0);
 HEAP32[$vararg_ptr102>>2] = $212;
 (_printf(3084,$vararg_buffer99)|0);
 $213 = $28;
 $214 = $29;
 $215 = ($213|0)==($214|0);
 if (!($215)) {
  (_printf(2565,$vararg_buffer103)|0);
  $216 = $8;
  $217 = (($216) + 1)|0;
  $8 = $217;
 }
 _fus_lexer_next($19);
 (_printf(5136,$vararg_buffer105)|0);
 $218 = $7;
 $219 = (($218) + 1)|0;
 $7 = $219;
 $220 = (_fus_lexer_got($19,5166)|0);
 if (!($220)) {
  (_printf(2565,$vararg_buffer107)|0);
  $221 = $8;
  $222 = (($221) + 1)|0;
  $8 = $222;
 }
 (_printf(4866,$vararg_buffer109)|0);
 $223 = $7;
 $224 = (($223) + 1)|0;
 $7 = $224;
 $225 = ((($19)) + 308|0);
 $226 = HEAP32[$225>>2]|0;
 $30 = $226;
 $31 = 3;
 $227 = $30;
 $228 = $31;
 HEAP32[$vararg_buffer111>>2] = $227;
 $vararg_ptr114 = ((($vararg_buffer111)) + 4|0);
 HEAP32[$vararg_ptr114>>2] = $228;
 (_printf(3084,$vararg_buffer111)|0);
 $229 = $30;
 $230 = $31;
 $231 = ($229|0)==($230|0);
 if (!($231)) {
  (_printf(2565,$vararg_buffer115)|0);
  $232 = $8;
  $233 = (($232) + 1)|0;
  $8 = $233;
 }
 _fus_lexer_next($19);
 (_printf(5168,$vararg_buffer117)|0);
 $234 = $7;
 $235 = (($234) + 1)|0;
 $7 = $235;
 $236 = (_fus_lexer_got($19,5198)|0);
 if (!($236)) {
  (_printf(2565,$vararg_buffer119)|0);
  $237 = $8;
  $238 = (($237) + 1)|0;
  $8 = $238;
 }
 (_printf(5200,$vararg_buffer121)|0);
 $239 = $7;
 $240 = (($239) + 1)|0;
 $7 = $240;
 $241 = ((($19)) + 308|0);
 $242 = HEAP32[$241>>2]|0;
 $32 = $242;
 $33 = 2;
 $243 = $32;
 $244 = $33;
 HEAP32[$vararg_buffer123>>2] = $243;
 $vararg_ptr126 = ((($vararg_buffer123)) + 4|0);
 HEAP32[$vararg_ptr126>>2] = $244;
 (_printf(3084,$vararg_buffer123)|0);
 $245 = $32;
 $246 = $33;
 $247 = ($245|0)==($246|0);
 if (!($247)) {
  (_printf(2565,$vararg_buffer127)|0);
  $248 = $8;
  $249 = (($248) + 1)|0;
  $8 = $249;
 }
 _fus_lexer_next($19);
 (_printf(5136,$vararg_buffer129)|0);
 $250 = $7;
 $251 = (($250) + 1)|0;
 $7 = $251;
 $252 = (_fus_lexer_got($19,5166)|0);
 if (!($252)) {
  (_printf(2565,$vararg_buffer131)|0);
  $253 = $8;
  $254 = (($253) + 1)|0;
  $8 = $254;
 }
 (_printf(4866,$vararg_buffer133)|0);
 $255 = $7;
 $256 = (($255) + 1)|0;
 $7 = $256;
 $257 = ((($19)) + 308|0);
 $258 = HEAP32[$257>>2]|0;
 $34 = $258;
 $35 = 3;
 $259 = $34;
 $260 = $35;
 HEAP32[$vararg_buffer135>>2] = $259;
 $vararg_ptr138 = ((($vararg_buffer135)) + 4|0);
 HEAP32[$vararg_ptr138>>2] = $260;
 (_printf(3084,$vararg_buffer135)|0);
 $261 = $34;
 $262 = $35;
 $263 = ($261|0)==($262|0);
 if (!($263)) {
  (_printf(2565,$vararg_buffer139)|0);
  $264 = $8;
  $265 = (($264) + 1)|0;
  $8 = $265;
 }
 _fus_lexer_next($19);
 (_printf(5237,$vararg_buffer141)|0);
 $266 = $7;
 $267 = (($266) + 1)|0;
 $7 = $267;
 $268 = (_fus_lexer_got($19,5272)|0);
 if (!($268)) {
  (_printf(2565,$vararg_buffer143)|0);
  $269 = $8;
  $270 = (($269) + 1)|0;
  $8 = $270;
 }
 (_printf(5099,$vararg_buffer145)|0);
 $271 = $7;
 $272 = (($271) + 1)|0;
 $7 = $272;
 $273 = ((($19)) + 308|0);
 $274 = HEAP32[$273>>2]|0;
 $36 = $274;
 $37 = 4;
 $275 = $36;
 $276 = $37;
 HEAP32[$vararg_buffer147>>2] = $275;
 $vararg_ptr150 = ((($vararg_buffer147)) + 4|0);
 HEAP32[$vararg_ptr150>>2] = $276;
 (_printf(3084,$vararg_buffer147)|0);
 $277 = $36;
 $278 = $37;
 $279 = ($277|0)==($278|0);
 if (!($279)) {
  (_printf(2565,$vararg_buffer151)|0);
  $280 = $8;
  $281 = (($280) + 1)|0;
  $8 = $281;
 }
 _fus_lexer_next($19);
 (_printf(5136,$vararg_buffer153)|0);
 $282 = $7;
 $283 = (($282) + 1)|0;
 $7 = $283;
 $284 = (_fus_lexer_got($19,5166)|0);
 if (!($284)) {
  (_printf(2565,$vararg_buffer155)|0);
  $285 = $8;
  $286 = (($285) + 1)|0;
  $8 = $286;
 }
 (_printf(4866,$vararg_buffer157)|0);
 $287 = $7;
 $288 = (($287) + 1)|0;
 $7 = $288;
 $289 = ((($19)) + 308|0);
 $290 = HEAP32[$289>>2]|0;
 $38 = $290;
 $39 = 3;
 $291 = $38;
 $292 = $39;
 HEAP32[$vararg_buffer159>>2] = $291;
 $vararg_ptr162 = ((($vararg_buffer159)) + 4|0);
 HEAP32[$vararg_ptr162>>2] = $292;
 (_printf(3084,$vararg_buffer159)|0);
 $293 = $38;
 $294 = $39;
 $295 = ($293|0)==($294|0);
 if (!($295)) {
  (_printf(2565,$vararg_buffer163)|0);
  $296 = $8;
  $297 = (($296) + 1)|0;
  $8 = $297;
 }
 _fus_lexer_next($19);
 (_printf(4941,$vararg_buffer165)|0);
 $298 = $7;
 $299 = (($298) + 1)|0;
 $7 = $299;
 $300 = (_fus_lexer_got($19,4971)|0);
 if (!($300)) {
  (_printf(2565,$vararg_buffer167)|0);
  $301 = $8;
  $302 = (($301) + 1)|0;
  $8 = $302;
 }
 (_printf(4973,$vararg_buffer169)|0);
 $303 = $7;
 $304 = (($303) + 1)|0;
 $7 = $304;
 $305 = ((($19)) + 308|0);
 $306 = HEAP32[$305>>2]|0;
 $40 = $306;
 $41 = 5;
 $307 = $40;
 $308 = $41;
 HEAP32[$vararg_buffer171>>2] = $307;
 $vararg_ptr174 = ((($vararg_buffer171)) + 4|0);
 HEAP32[$vararg_ptr174>>2] = $308;
 (_printf(3084,$vararg_buffer171)|0);
 $309 = $40;
 $310 = $41;
 $311 = ($309|0)==($310|0);
 if (!($311)) {
  (_printf(2565,$vararg_buffer175)|0);
  $312 = $8;
  $313 = (($312) + 1)|0;
  $8 = $313;
 }
 _fus_lexer_next($19);
 (_printf(5277,$vararg_buffer177)|0);
 $314 = $7;
 $315 = (($314) + 1)|0;
 $7 = $315;
 $316 = (_fus_lexer_got($19,5309)|0);
 if (!($316)) {
  (_printf(2565,$vararg_buffer179)|0);
  $317 = $8;
  $318 = (($317) + 1)|0;
  $8 = $318;
 }
 (_printf(4866,$vararg_buffer181)|0);
 $319 = $7;
 $320 = (($319) + 1)|0;
 $7 = $320;
 $321 = ((($19)) + 308|0);
 $322 = HEAP32[$321>>2]|0;
 $42 = $322;
 $43 = 3;
 $323 = $42;
 $324 = $43;
 HEAP32[$vararg_buffer183>>2] = $323;
 $vararg_ptr186 = ((($vararg_buffer183)) + 4|0);
 HEAP32[$vararg_ptr186>>2] = $324;
 (_printf(3084,$vararg_buffer183)|0);
 $325 = $42;
 $326 = $43;
 $327 = ($325|0)==($326|0);
 if (!($327)) {
  (_printf(2565,$vararg_buffer187)|0);
  $328 = $8;
  $329 = (($328) + 1)|0;
  $8 = $329;
 }
 _fus_lexer_next($19);
 (_printf(5313,$vararg_buffer189)|0);
 $330 = $7;
 $331 = (($330) + 1)|0;
 $7 = $331;
 $332 = (_fus_lexer_got($19,5343)|0);
 if (!($332)) {
  (_printf(2565,$vararg_buffer191)|0);
  $333 = $8;
  $334 = (($333) + 1)|0;
  $8 = $334;
 }
 (_printf(5200,$vararg_buffer193)|0);
 $335 = $7;
 $336 = (($335) + 1)|0;
 $7 = $336;
 $337 = ((($19)) + 308|0);
 $338 = HEAP32[$337>>2]|0;
 $44 = $338;
 $45 = 2;
 $339 = $44;
 $340 = $45;
 HEAP32[$vararg_buffer195>>2] = $339;
 $vararg_ptr198 = ((($vararg_buffer195)) + 4|0);
 HEAP32[$vararg_ptr198>>2] = $340;
 (_printf(3084,$vararg_buffer195)|0);
 $341 = $44;
 $342 = $45;
 $343 = ($341|0)==($342|0);
 if (!($343)) {
  (_printf(2565,$vararg_buffer199)|0);
  $344 = $8;
  $345 = (($344) + 1)|0;
  $8 = $345;
 }
 _fus_lexer_next($19);
 (_printf(5345,$vararg_buffer201)|0);
 $346 = $7;
 $347 = (($346) + 1)|0;
 $7 = $347;
 $348 = (_fus_lexer_got($19,5376)|0);
 if (!($348)) {
  (_printf(2565,$vararg_buffer203)|0);
  $349 = $8;
  $350 = (($349) + 1)|0;
  $8 = $350;
 }
 (_printf(4866,$vararg_buffer205)|0);
 $351 = $7;
 $352 = (($351) + 1)|0;
 $7 = $352;
 $353 = ((($19)) + 308|0);
 $354 = HEAP32[$353>>2]|0;
 $46 = $354;
 $47 = 3;
 $355 = $46;
 $356 = $47;
 HEAP32[$vararg_buffer207>>2] = $355;
 $vararg_ptr210 = ((($vararg_buffer207)) + 4|0);
 HEAP32[$vararg_ptr210>>2] = $356;
 (_printf(3084,$vararg_buffer207)|0);
 $357 = $46;
 $358 = $47;
 $359 = ($357|0)==($358|0);
 if (!($359)) {
  (_printf(2565,$vararg_buffer211)|0);
  $360 = $8;
  $361 = (($360) + 1)|0;
  $8 = $361;
 }
 _fus_lexer_next($19);
 (_printf(5379,$vararg_buffer213)|0);
 $362 = $7;
 $363 = (($362) + 1)|0;
 $7 = $363;
 $364 = (_fus_lexer_got($19,5409)|0);
 if (!($364)) {
  (_printf(2565,$vararg_buffer215)|0);
  $365 = $8;
  $366 = (($365) + 1)|0;
  $8 = $366;
 }
 (_printf(4866,$vararg_buffer217)|0);
 $367 = $7;
 $368 = (($367) + 1)|0;
 $7 = $368;
 $369 = ((($19)) + 308|0);
 $370 = HEAP32[$369>>2]|0;
 $48 = $370;
 $49 = 3;
 $371 = $48;
 $372 = $49;
 HEAP32[$vararg_buffer219>>2] = $371;
 $vararg_ptr222 = ((($vararg_buffer219)) + 4|0);
 HEAP32[$vararg_ptr222>>2] = $372;
 (_printf(3084,$vararg_buffer219)|0);
 $373 = $48;
 $374 = $49;
 $375 = ($373|0)==($374|0);
 if (!($375)) {
  (_printf(2565,$vararg_buffer223)|0);
  $376 = $8;
  $377 = (($376) + 1)|0;
  $8 = $377;
 }
 _fus_lexer_next($19);
 (_printf(5168,$vararg_buffer225)|0);
 $378 = $7;
 $379 = (($378) + 1)|0;
 $7 = $379;
 $380 = (_fus_lexer_got($19,5198)|0);
 if (!($380)) {
  (_printf(2565,$vararg_buffer227)|0);
  $381 = $8;
  $382 = (($381) + 1)|0;
  $8 = $382;
 }
 (_printf(5200,$vararg_buffer229)|0);
 $383 = $7;
 $384 = (($383) + 1)|0;
 $7 = $384;
 $385 = ((($19)) + 308|0);
 $386 = HEAP32[$385>>2]|0;
 $50 = $386;
 $51 = 2;
 $387 = $50;
 $388 = $51;
 HEAP32[$vararg_buffer231>>2] = $387;
 $vararg_ptr234 = ((($vararg_buffer231)) + 4|0);
 HEAP32[$vararg_ptr234>>2] = $388;
 (_printf(3084,$vararg_buffer231)|0);
 $389 = $50;
 $390 = $51;
 $391 = ($389|0)==($390|0);
 if (!($391)) {
  (_printf(2565,$vararg_buffer235)|0);
  $392 = $8;
  $393 = (($392) + 1)|0;
  $8 = $393;
 }
 _fus_lexer_next($19);
 (_printf(5345,$vararg_buffer237)|0);
 $394 = $7;
 $395 = (($394) + 1)|0;
 $7 = $395;
 $396 = (_fus_lexer_got($19,5376)|0);
 if (!($396)) {
  (_printf(2565,$vararg_buffer239)|0);
  $397 = $8;
  $398 = (($397) + 1)|0;
  $8 = $398;
 }
 (_printf(4866,$vararg_buffer241)|0);
 $399 = $7;
 $400 = (($399) + 1)|0;
 $7 = $400;
 $401 = ((($19)) + 308|0);
 $402 = HEAP32[$401>>2]|0;
 $52 = $402;
 $53 = 3;
 $403 = $52;
 $404 = $53;
 HEAP32[$vararg_buffer243>>2] = $403;
 $vararg_ptr246 = ((($vararg_buffer243)) + 4|0);
 HEAP32[$vararg_ptr246>>2] = $404;
 (_printf(3084,$vararg_buffer243)|0);
 $405 = $52;
 $406 = $53;
 $407 = ($405|0)==($406|0);
 if (!($407)) {
  (_printf(2565,$vararg_buffer247)|0);
  $408 = $8;
  $409 = (($408) + 1)|0;
  $8 = $409;
 }
 _fus_lexer_next($19);
 (_printf(5411,$vararg_buffer249)|0);
 $410 = $7;
 $411 = (($410) + 1)|0;
 $7 = $411;
 $412 = (_fus_lexer_got($19,5441)|0);
 if (!($412)) {
  (_printf(2565,$vararg_buffer251)|0);
  $413 = $8;
  $414 = (($413) + 1)|0;
  $8 = $414;
 }
 (_printf(4866,$vararg_buffer253)|0);
 $415 = $7;
 $416 = (($415) + 1)|0;
 $7 = $416;
 $417 = ((($19)) + 308|0);
 $418 = HEAP32[$417>>2]|0;
 $54 = $418;
 $55 = 3;
 $419 = $54;
 $420 = $55;
 HEAP32[$vararg_buffer255>>2] = $419;
 $vararg_ptr258 = ((($vararg_buffer255)) + 4|0);
 HEAP32[$vararg_ptr258>>2] = $420;
 (_printf(3084,$vararg_buffer255)|0);
 $421 = $54;
 $422 = $55;
 $423 = ($421|0)==($422|0);
 if (!($423)) {
  (_printf(2565,$vararg_buffer259)|0);
  $424 = $8;
  $425 = (($424) + 1)|0;
  $8 = $425;
 }
 _fus_lexer_next($19);
 (_printf(5443,$vararg_buffer261)|0);
 $426 = $7;
 $427 = (($426) + 1)|0;
 $7 = $427;
 $428 = (_fus_lexer_got($19,5473)|0);
 if (!($428)) {
  (_printf(2565,$vararg_buffer263)|0);
  $429 = $8;
  $430 = (($429) + 1)|0;
  $8 = $430;
 }
 (_printf(5475,$vararg_buffer265)|0);
 $431 = $7;
 $432 = (($431) + 1)|0;
 $7 = $432;
 $433 = ((($19)) + 308|0);
 $434 = HEAP32[$433>>2]|0;
 $56 = $434;
 $57 = 6;
 $435 = $56;
 $436 = $57;
 HEAP32[$vararg_buffer267>>2] = $435;
 $vararg_ptr270 = ((($vararg_buffer267)) + 4|0);
 HEAP32[$vararg_ptr270>>2] = $436;
 (_printf(3084,$vararg_buffer267)|0);
 $437 = $56;
 $438 = $57;
 $439 = ($437|0)==($438|0);
 if (!($439)) {
  (_printf(2565,$vararg_buffer271)|0);
  $440 = $8;
  $441 = (($440) + 1)|0;
  $8 = $441;
 }
 _fus_lexer_next($19);
 (_printf(5136,$vararg_buffer273)|0);
 $442 = $7;
 $443 = (($442) + 1)|0;
 $7 = $443;
 $444 = (_fus_lexer_got($19,5166)|0);
 if (!($444)) {
  (_printf(2565,$vararg_buffer275)|0);
  $445 = $8;
  $446 = (($445) + 1)|0;
  $8 = $446;
 }
 (_printf(4866,$vararg_buffer277)|0);
 $447 = $7;
 $448 = (($447) + 1)|0;
 $7 = $448;
 $449 = ((($19)) + 308|0);
 $450 = HEAP32[$449>>2]|0;
 $58 = $450;
 $59 = 3;
 $451 = $58;
 $452 = $59;
 HEAP32[$vararg_buffer279>>2] = $451;
 $vararg_ptr282 = ((($vararg_buffer279)) + 4|0);
 HEAP32[$vararg_ptr282>>2] = $452;
 (_printf(3084,$vararg_buffer279)|0);
 $453 = $58;
 $454 = $59;
 $455 = ($453|0)==($454|0);
 if (!($455)) {
  (_printf(2565,$vararg_buffer283)|0);
  $456 = $8;
  $457 = (($456) + 1)|0;
  $8 = $457;
 }
 _fus_lexer_next($19);
 (_printf(5518,$vararg_buffer285)|0);
 $458 = $7;
 $459 = (($458) + 1)|0;
 $7 = $459;
 $460 = (_fus_lexer_got($19,5552)|0);
 if (!($460)) {
  (_printf(2565,$vararg_buffer287)|0);
  $461 = $8;
  $462 = (($461) + 1)|0;
  $8 = $462;
 }
 (_printf(5099,$vararg_buffer289)|0);
 $463 = $7;
 $464 = (($463) + 1)|0;
 $7 = $464;
 $465 = ((($19)) + 308|0);
 $466 = HEAP32[$465>>2]|0;
 $60 = $466;
 $61 = 4;
 $467 = $60;
 $468 = $61;
 HEAP32[$vararg_buffer291>>2] = $467;
 $vararg_ptr294 = ((($vararg_buffer291)) + 4|0);
 HEAP32[$vararg_ptr294>>2] = $468;
 (_printf(3084,$vararg_buffer291)|0);
 $469 = $60;
 $470 = $61;
 $471 = ($469|0)==($470|0);
 if (!($471)) {
  (_printf(2565,$vararg_buffer295)|0);
  $472 = $8;
  $473 = (($472) + 1)|0;
  $8 = $473;
 }
 _fus_lexer_next($19);
 (_printf(5136,$vararg_buffer297)|0);
 $474 = $7;
 $475 = (($474) + 1)|0;
 $7 = $475;
 $476 = (_fus_lexer_got($19,5166)|0);
 if (!($476)) {
  (_printf(2565,$vararg_buffer299)|0);
  $477 = $8;
  $478 = (($477) + 1)|0;
  $8 = $478;
 }
 (_printf(4866,$vararg_buffer301)|0);
 $479 = $7;
 $480 = (($479) + 1)|0;
 $7 = $480;
 $481 = ((($19)) + 308|0);
 $482 = HEAP32[$481>>2]|0;
 $62 = $482;
 $63 = 3;
 $483 = $62;
 $484 = $63;
 HEAP32[$vararg_buffer303>>2] = $483;
 $vararg_ptr306 = ((($vararg_buffer303)) + 4|0);
 HEAP32[$vararg_ptr306>>2] = $484;
 (_printf(3084,$vararg_buffer303)|0);
 $485 = $62;
 $486 = $63;
 $487 = ($485|0)==($486|0);
 if (!($487)) {
  (_printf(2565,$vararg_buffer307)|0);
  $488 = $8;
  $489 = (($488) + 1)|0;
  $8 = $489;
 }
 _fus_lexer_next($19);
 (_printf(5556,$vararg_buffer309)|0);
 $490 = $7;
 $491 = (($490) + 1)|0;
 $7 = $491;
 $492 = (_fus_lexer_got($19,5586)|0);
 if (!($492)) {
  (_printf(2565,$vararg_buffer311)|0);
  $493 = $8;
  $494 = (($493) + 1)|0;
  $8 = $494;
 }
 (_printf(4866,$vararg_buffer313)|0);
 $495 = $7;
 $496 = (($495) + 1)|0;
 $7 = $496;
 $497 = ((($19)) + 308|0);
 $498 = HEAP32[$497>>2]|0;
 $64 = $498;
 $65 = 3;
 $499 = $64;
 $500 = $65;
 HEAP32[$vararg_buffer315>>2] = $499;
 $vararg_ptr318 = ((($vararg_buffer315)) + 4|0);
 HEAP32[$vararg_ptr318>>2] = $500;
 (_printf(3084,$vararg_buffer315)|0);
 $501 = $64;
 $502 = $65;
 $503 = ($501|0)==($502|0);
 if (!($503)) {
  (_printf(2565,$vararg_buffer319)|0);
  $504 = $8;
  $505 = (($504) + 1)|0;
  $8 = $505;
 }
 _fus_lexer_next($19);
 (_printf(5588,$vararg_buffer321)|0);
 $506 = $7;
 $507 = (($506) + 1)|0;
 $7 = $507;
 $508 = (_fus_lexer_got($19,5623)|0);
 if (!($508)) {
  (_printf(2565,$vararg_buffer323)|0);
  $509 = $8;
  $510 = (($509) + 1)|0;
  $8 = $510;
 }
 (_printf(4866,$vararg_buffer325)|0);
 $511 = $7;
 $512 = (($511) + 1)|0;
 $7 = $512;
 $513 = ((($19)) + 308|0);
 $514 = HEAP32[$513>>2]|0;
 $66 = $514;
 $67 = 3;
 $515 = $66;
 $516 = $67;
 HEAP32[$vararg_buffer327>>2] = $515;
 $vararg_ptr330 = ((($vararg_buffer327)) + 4|0);
 HEAP32[$vararg_ptr330>>2] = $516;
 (_printf(3084,$vararg_buffer327)|0);
 $517 = $66;
 $518 = $67;
 $519 = ($517|0)==($518|0);
 if (!($519)) {
  (_printf(2565,$vararg_buffer331)|0);
  $520 = $8;
  $521 = (($520) + 1)|0;
  $8 = $521;
 }
 _fus_lexer_next($19);
 (_printf(5630,$vararg_buffer333)|0);
 $522 = $7;
 $523 = (($522) + 1)|0;
 $7 = $523;
 $524 = (_fus_lexer_got($19,5685)|0);
 if (!($524)) {
  (_printf(2565,$vararg_buffer335)|0);
  $525 = $8;
  $526 = (($525) + 1)|0;
  $8 = $526;
 }
 (_printf(5099,$vararg_buffer337)|0);
 $527 = $7;
 $528 = (($527) + 1)|0;
 $7 = $528;
 $529 = ((($19)) + 308|0);
 $530 = HEAP32[$529>>2]|0;
 $68 = $530;
 $69 = 4;
 $531 = $68;
 $532 = $69;
 HEAP32[$vararg_buffer339>>2] = $531;
 $vararg_ptr342 = ((($vararg_buffer339)) + 4|0);
 HEAP32[$vararg_ptr342>>2] = $532;
 (_printf(3084,$vararg_buffer339)|0);
 $533 = $68;
 $534 = $69;
 $535 = ($533|0)==($534|0);
 if (!($535)) {
  (_printf(2565,$vararg_buffer343)|0);
  $536 = $8;
  $537 = (($536) + 1)|0;
  $8 = $537;
 }
 _fus_lexer_next($19);
 (_printf(5710,$vararg_buffer345)|0);
 $538 = $7;
 $539 = (($538) + 1)|0;
 $7 = $539;
 $540 = (_fus_lexer_got($19,5745)|0);
 if (!($540)) {
  (_printf(2565,$vararg_buffer347)|0);
  $541 = $8;
  $542 = (($541) + 1)|0;
  $8 = $542;
 }
 (_printf(4866,$vararg_buffer349)|0);
 $543 = $7;
 $544 = (($543) + 1)|0;
 $7 = $544;
 $545 = ((($19)) + 308|0);
 $546 = HEAP32[$545>>2]|0;
 $70 = $546;
 $71 = 3;
 $547 = $70;
 $548 = $71;
 HEAP32[$vararg_buffer351>>2] = $547;
 $vararg_ptr354 = ((($vararg_buffer351)) + 4|0);
 HEAP32[$vararg_ptr354>>2] = $548;
 (_printf(3084,$vararg_buffer351)|0);
 $549 = $70;
 $550 = $71;
 $551 = ($549|0)==($550|0);
 if (!($551)) {
  (_printf(2565,$vararg_buffer355)|0);
  $552 = $8;
  $553 = (($552) + 1)|0;
  $8 = $553;
 }
 _fus_lexer_next($19);
 (_printf(4754,$vararg_buffer357)|0);
 $554 = $7;
 $555 = (($554) + 1)|0;
 $7 = $555;
 $556 = (_fus_lexer_got($19,4789)|0);
 if (!($556)) {
  (_printf(2565,$vararg_buffer359)|0);
  $557 = $8;
  $558 = (($557) + 1)|0;
  $8 = $558;
 }
 (_printf(4866,$vararg_buffer361)|0);
 $559 = $7;
 $560 = (($559) + 1)|0;
 $7 = $560;
 $561 = ((($19)) + 308|0);
 $562 = HEAP32[$561>>2]|0;
 $72 = $562;
 $73 = 3;
 $563 = $72;
 $564 = $73;
 HEAP32[$vararg_buffer363>>2] = $563;
 $vararg_ptr366 = ((($vararg_buffer363)) + 4|0);
 HEAP32[$vararg_ptr366>>2] = $564;
 (_printf(3084,$vararg_buffer363)|0);
 $565 = $72;
 $566 = $73;
 $567 = ($565|0)==($566|0);
 if (!($567)) {
  (_printf(2565,$vararg_buffer367)|0);
  $568 = $8;
  $569 = (($568) + 1)|0;
  $8 = $569;
 }
 _fus_lexer_next($19);
 (_printf(5443,$vararg_buffer369)|0);
 $570 = $7;
 $571 = (($570) + 1)|0;
 $7 = $571;
 $572 = (_fus_lexer_got($19,5473)|0);
 if (!($572)) {
  (_printf(2565,$vararg_buffer371)|0);
  $573 = $8;
  $574 = (($573) + 1)|0;
  $8 = $574;
 }
 (_printf(5475,$vararg_buffer373)|0);
 $575 = $7;
 $576 = (($575) + 1)|0;
 $7 = $576;
 $577 = ((($19)) + 308|0);
 $578 = HEAP32[$577>>2]|0;
 $74 = $578;
 $75 = 6;
 $579 = $74;
 $580 = $75;
 HEAP32[$vararg_buffer375>>2] = $579;
 $vararg_ptr378 = ((($vararg_buffer375)) + 4|0);
 HEAP32[$vararg_ptr378>>2] = $580;
 (_printf(3084,$vararg_buffer375)|0);
 $581 = $74;
 $582 = $75;
 $583 = ($581|0)==($582|0);
 if (!($583)) {
  (_printf(2565,$vararg_buffer379)|0);
  $584 = $8;
  $585 = (($584) + 1)|0;
  $8 = $585;
 }
 _fus_lexer_next($19);
 (_printf(4423,$vararg_buffer381)|0);
 $586 = $7;
 $587 = (($586) + 1)|0;
 $7 = $587;
 $588 = (_fus_lexer_is_done($19)|0);
 if ($588) {
  _fus_lexer_cleanup($19);
  $591 = $6;
  HEAP32[$vararg_buffer385>>2] = $591;
  (_printf(3098,$vararg_buffer385)|0);
  $592 = $7;
  $593 = $8;
  $594 = (($592) - ($593))|0;
  $595 = $7;
  $596 = $8;
  $597 = ($596|0)==(0);
  $598 = $597 ? 3107 : 3110;
  HEAP32[$vararg_buffer388>>2] = $594;
  $vararg_ptr391 = ((($vararg_buffer388)) + 4|0);
  HEAP32[$vararg_ptr391>>2] = $595;
  $vararg_ptr392 = ((($vararg_buffer388)) + 8|0);
  HEAP32[$vararg_ptr392>>2] = $598;
  (_printf(3115,$vararg_buffer388)|0);
  (_printf(2401,$vararg_buffer393)|0);
  (_printf(3141,$vararg_buffer395)|0);
  $599 = $7;
  $600 = $4;
  $601 = HEAP32[$600>>2]|0;
  $602 = (($601) + ($599))|0;
  HEAP32[$600>>2] = $602;
  $603 = $8;
  $604 = $5;
  $605 = HEAP32[$604>>2]|0;
  $606 = (($605) + ($603))|0;
  HEAP32[$604>>2] = $606;
  STACKTOP = sp;return;
 }
 (_printf(2565,$vararg_buffer383)|0);
 $589 = $8;
 $590 = (($589) + 1)|0;
 $8 = $590;
 _fus_lexer_cleanup($19);
 $591 = $6;
 HEAP32[$vararg_buffer385>>2] = $591;
 (_printf(3098,$vararg_buffer385)|0);
 $592 = $7;
 $593 = $8;
 $594 = (($592) - ($593))|0;
 $595 = $7;
 $596 = $8;
 $597 = ($596|0)==(0);
 $598 = $597 ? 3107 : 3110;
 HEAP32[$vararg_buffer388>>2] = $594;
 $vararg_ptr391 = ((($vararg_buffer388)) + 4|0);
 HEAP32[$vararg_ptr391>>2] = $595;
 $vararg_ptr392 = ((($vararg_buffer388)) + 8|0);
 HEAP32[$vararg_ptr392>>2] = $598;
 (_printf(3115,$vararg_buffer388)|0);
 (_printf(2401,$vararg_buffer393)|0);
 (_printf(3141,$vararg_buffer395)|0);
 $599 = $7;
 $600 = $4;
 $601 = HEAP32[$600>>2]|0;
 $602 = (($601) + ($599))|0;
 HEAP32[$600>>2] = $602;
 $603 = $8;
 $604 = $5;
 $605 = HEAP32[$604>>2]|0;
 $606 = (($605) + ($603))|0;
 HEAP32[$604>>2] = $606;
 STACKTOP = sp;return;
}
function _run_symtable_tests_basic($0,$1,$2) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 var $10 = 0, $100 = 0, $101 = 0, $102 = 0, $103 = 0, $104 = 0, $105 = 0, $106 = 0, $107 = 0, $108 = 0, $109 = 0, $11 = 0, $110 = 0, $111 = 0, $112 = 0, $113 = 0, $114 = 0, $115 = 0, $116 = 0, $117 = 0;
 var $118 = 0, $119 = 0, $12 = 0, $120 = 0, $121 = 0, $122 = 0, $123 = 0, $124 = 0, $125 = 0, $126 = 0, $127 = 0, $128 = 0, $129 = 0, $13 = 0, $130 = 0, $131 = 0, $132 = 0, $133 = 0, $134 = 0, $135 = 0;
 var $136 = 0, $137 = 0, $138 = 0, $139 = 0, $14 = 0, $140 = 0, $141 = 0, $142 = 0, $143 = 0, $144 = 0, $145 = 0, $146 = 0, $147 = 0, $148 = 0, $149 = 0, $15 = 0, $150 = 0, $151 = 0, $152 = 0, $153 = 0;
 var $154 = 0, $155 = 0, $156 = 0, $157 = 0, $158 = 0, $159 = 0, $16 = 0, $160 = 0, $161 = 0, $162 = 0, $163 = 0, $164 = 0, $165 = 0, $166 = 0, $167 = 0, $168 = 0, $169 = 0, $17 = 0, $170 = 0, $171 = 0;
 var $172 = 0, $173 = 0, $174 = 0, $175 = 0, $176 = 0, $177 = 0, $178 = 0, $179 = 0, $18 = 0, $180 = 0, $181 = 0, $182 = 0, $19 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0;
 var $27 = 0, $28 = 0, $29 = 0, $3 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $4 = 0, $40 = 0, $41 = 0, $42 = 0, $43 = 0, $44 = 0;
 var $45 = 0, $46 = 0, $47 = 0, $48 = 0, $49 = 0, $5 = 0, $50 = 0, $51 = 0, $52 = 0, $53 = 0, $54 = 0, $55 = 0, $56 = 0, $57 = 0, $58 = 0, $59 = 0, $6 = 0, $60 = 0, $61 = 0, $62 = 0;
 var $63 = 0, $64 = 0, $65 = 0, $66 = 0, $67 = 0, $68 = 0, $69 = 0, $7 = 0, $70 = 0, $71 = 0, $72 = 0, $73 = 0, $74 = 0, $75 = 0, $76 = 0, $77 = 0, $78 = 0, $79 = 0, $8 = 0, $80 = 0;
 var $81 = 0, $82 = 0, $83 = 0, $84 = 0, $85 = 0, $86 = 0, $87 = 0, $88 = 0, $89 = 0, $9 = 0, $90 = 0, $91 = 0, $92 = 0, $93 = 0, $94 = 0, $95 = 0, $96 = 0, $97 = 0, $98 = 0, $99 = 0;
 var $vararg_buffer = 0, $vararg_buffer1 = 0, $vararg_buffer102 = 0, $vararg_buffer107 = 0, $vararg_buffer109 = 0, $vararg_buffer11 = 0, $vararg_buffer13 = 0, $vararg_buffer17 = 0, $vararg_buffer19 = 0, $vararg_buffer21 = 0, $vararg_buffer25 = 0, $vararg_buffer27 = 0, $vararg_buffer29 = 0, $vararg_buffer3 = 0, $vararg_buffer33 = 0, $vararg_buffer35 = 0, $vararg_buffer37 = 0, $vararg_buffer41 = 0, $vararg_buffer43 = 0, $vararg_buffer45 = 0;
 var $vararg_buffer49 = 0, $vararg_buffer5 = 0, $vararg_buffer51 = 0, $vararg_buffer53 = 0, $vararg_buffer57 = 0, $vararg_buffer59 = 0, $vararg_buffer61 = 0, $vararg_buffer65 = 0, $vararg_buffer67 = 0, $vararg_buffer69 = 0, $vararg_buffer73 = 0, $vararg_buffer75 = 0, $vararg_buffer77 = 0, $vararg_buffer81 = 0, $vararg_buffer83 = 0, $vararg_buffer85 = 0, $vararg_buffer89 = 0, $vararg_buffer9 = 0, $vararg_buffer91 = 0, $vararg_buffer93 = 0;
 var $vararg_buffer97 = 0, $vararg_buffer99 = 0, $vararg_ptr105 = 0, $vararg_ptr106 = 0, $vararg_ptr16 = 0, $vararg_ptr24 = 0, $vararg_ptr32 = 0, $vararg_ptr40 = 0, $vararg_ptr48 = 0, $vararg_ptr56 = 0, $vararg_ptr64 = 0, $vararg_ptr72 = 0, $vararg_ptr8 = 0, $vararg_ptr80 = 0, $vararg_ptr88 = 0, $vararg_ptr96 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 528|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(528|0);
 $vararg_buffer109 = sp + 336|0;
 $vararg_buffer107 = sp + 328|0;
 $vararg_buffer102 = sp + 312|0;
 $vararg_buffer99 = sp + 304|0;
 $vararg_buffer97 = sp + 296|0;
 $vararg_buffer93 = sp + 288|0;
 $vararg_buffer91 = sp + 280|0;
 $vararg_buffer89 = sp + 272|0;
 $vararg_buffer85 = sp + 264|0;
 $vararg_buffer83 = sp + 256|0;
 $vararg_buffer81 = sp + 248|0;
 $vararg_buffer77 = sp + 240|0;
 $vararg_buffer75 = sp + 232|0;
 $vararg_buffer73 = sp + 224|0;
 $vararg_buffer69 = sp + 216|0;
 $vararg_buffer67 = sp + 208|0;
 $vararg_buffer65 = sp + 200|0;
 $vararg_buffer61 = sp + 192|0;
 $vararg_buffer59 = sp + 184|0;
 $vararg_buffer57 = sp + 176|0;
 $vararg_buffer53 = sp + 168|0;
 $vararg_buffer51 = sp + 160|0;
 $vararg_buffer49 = sp + 152|0;
 $vararg_buffer45 = sp + 144|0;
 $vararg_buffer43 = sp + 136|0;
 $vararg_buffer41 = sp + 128|0;
 $vararg_buffer37 = sp + 120|0;
 $vararg_buffer35 = sp + 112|0;
 $vararg_buffer33 = sp + 104|0;
 $vararg_buffer29 = sp + 96|0;
 $vararg_buffer27 = sp + 88|0;
 $vararg_buffer25 = sp + 80|0;
 $vararg_buffer21 = sp + 72|0;
 $vararg_buffer19 = sp + 64|0;
 $vararg_buffer17 = sp + 56|0;
 $vararg_buffer13 = sp + 48|0;
 $vararg_buffer11 = sp + 40|0;
 $vararg_buffer9 = sp + 32|0;
 $vararg_buffer5 = sp + 24|0;
 $vararg_buffer3 = sp + 16|0;
 $vararg_buffer1 = sp + 8|0;
 $vararg_buffer = sp;
 $9 = sp + 448|0;
 $3 = $0;
 $4 = $1;
 $5 = $2;
 $6 = 5752;
 $7 = 0;
 $8 = 0;
 (_printf(2401,$vararg_buffer)|0);
 $37 = $6;
 HEAP32[$vararg_buffer1>>2] = $37;
 (_printf(2483,$vararg_buffer1)|0);
 $38 = $3;
 _fus_symtable_init($9,$38);
 (_printf(5775,$vararg_buffer3)|0);
 $39 = $7;
 $40 = (($39) + 1)|0;
 $7 = $40;
 $41 = (_fus_symtable_len($9)|0);
 $10 = $41;
 $11 = 0;
 $42 = $10;
 $43 = $11;
 HEAP32[$vararg_buffer5>>2] = $42;
 $vararg_ptr8 = ((($vararg_buffer5)) + 4|0);
 HEAP32[$vararg_ptr8>>2] = $43;
 (_printf(3084,$vararg_buffer5)|0);
 $44 = $10;
 $45 = $11;
 $46 = ($44|0)==($45|0);
 if (!($46)) {
  (_printf(2565,$vararg_buffer9)|0);
  $47 = $8;
  $48 = (($47) + 1)|0;
  $8 = $48;
 }
 $49 = (_fus_symtable_add_from_string($9,5409)|0);
 $12 = $49;
 (_printf(5808,$vararg_buffer11)|0);
 $50 = $7;
 $51 = (($50) + 1)|0;
 $7 = $51;
 $52 = (_fus_symtable_len($9)|0);
 $13 = $52;
 $14 = 1;
 $53 = $13;
 $54 = $14;
 HEAP32[$vararg_buffer13>>2] = $53;
 $vararg_ptr16 = ((($vararg_buffer13)) + 4|0);
 HEAP32[$vararg_ptr16>>2] = $54;
 (_printf(3084,$vararg_buffer13)|0);
 $55 = $13;
 $56 = $14;
 $57 = ($55|0)==($56|0);
 if (!($57)) {
  (_printf(2565,$vararg_buffer17)|0);
  $58 = $8;
  $59 = (($58) + 1)|0;
  $8 = $59;
 }
 (_printf(5841,$vararg_buffer19)|0);
 $60 = $7;
 $61 = (($60) + 1)|0;
 $7 = $61;
 $62 = (_fus_symtable_get_from_string($9,5409)|0);
 $15 = $62;
 $63 = $12;
 $16 = $63;
 $64 = $15;
 $65 = $16;
 HEAP32[$vararg_buffer21>>2] = $64;
 $vararg_ptr24 = ((($vararg_buffer21)) + 4|0);
 HEAP32[$vararg_ptr24>>2] = $65;
 (_printf(3084,$vararg_buffer21)|0);
 $66 = $15;
 $67 = $16;
 $68 = ($66|0)==($67|0);
 if (!($68)) {
  (_printf(2565,$vararg_buffer25)|0);
  $69 = $8;
  $70 = (($69) + 1)|0;
  $8 = $70;
 }
 (_printf(5897,$vararg_buffer27)|0);
 $71 = $7;
 $72 = (($71) + 1)|0;
 $7 = $72;
 $73 = (_fus_symtable_get_or_add_from_string($9,5409)|0);
 $17 = $73;
 $74 = $12;
 $18 = $74;
 $75 = $17;
 $76 = $18;
 HEAP32[$vararg_buffer29>>2] = $75;
 $vararg_ptr32 = ((($vararg_buffer29)) + 4|0);
 HEAP32[$vararg_ptr32>>2] = $76;
 (_printf(3084,$vararg_buffer29)|0);
 $77 = $17;
 $78 = $18;
 $79 = ($77|0)==($78|0);
 if (!($79)) {
  (_printf(2565,$vararg_buffer33)|0);
  $80 = $8;
  $81 = (($80) + 1)|0;
  $8 = $81;
 }
 (_printf(5808,$vararg_buffer35)|0);
 $82 = $7;
 $83 = (($82) + 1)|0;
 $7 = $83;
 $84 = (_fus_symtable_len($9)|0);
 $19 = $84;
 $20 = 1;
 $85 = $19;
 $86 = $20;
 HEAP32[$vararg_buffer37>>2] = $85;
 $vararg_ptr40 = ((($vararg_buffer37)) + 4|0);
 HEAP32[$vararg_ptr40>>2] = $86;
 (_printf(3084,$vararg_buffer37)|0);
 $87 = $19;
 $88 = $20;
 $89 = ($87|0)==($88|0);
 if (!($89)) {
  (_printf(2565,$vararg_buffer41)|0);
  $90 = $8;
  $91 = (($90) + 1)|0;
  $8 = $91;
 }
 $92 = (_fus_symtable_add_from_string($9,5441)|0);
 $21 = $92;
 (_printf(5960,$vararg_buffer43)|0);
 $93 = $7;
 $94 = (($93) + 1)|0;
 $7 = $94;
 $95 = (_fus_symtable_len($9)|0);
 $22 = $95;
 $23 = 2;
 $96 = $22;
 $97 = $23;
 HEAP32[$vararg_buffer45>>2] = $96;
 $vararg_ptr48 = ((($vararg_buffer45)) + 4|0);
 HEAP32[$vararg_ptr48>>2] = $97;
 (_printf(3084,$vararg_buffer45)|0);
 $98 = $22;
 $99 = $23;
 $100 = ($98|0)==($99|0);
 if (!($100)) {
  (_printf(2565,$vararg_buffer49)|0);
  $101 = $8;
  $102 = (($101) + 1)|0;
  $8 = $102;
 }
 (_printf(5993,$vararg_buffer51)|0);
 $103 = $7;
 $104 = (($103) + 1)|0;
 $7 = $104;
 $105 = $12;
 $24 = $105;
 $106 = $21;
 $25 = $106;
 $107 = $24;
 $108 = $25;
 HEAP32[$vararg_buffer53>>2] = $107;
 $vararg_ptr56 = ((($vararg_buffer53)) + 4|0);
 HEAP32[$vararg_ptr56>>2] = $108;
 (_printf(6015,$vararg_buffer53)|0);
 $109 = $24;
 $110 = $25;
 $111 = ($109|0)!=($110|0);
 if (!($111)) {
  (_printf(2565,$vararg_buffer57)|0);
  $112 = $8;
  $113 = (($112) + 1)|0;
  $8 = $113;
 }
 (_printf(5841,$vararg_buffer59)|0);
 $114 = $7;
 $115 = (($114) + 1)|0;
 $7 = $115;
 $116 = (_fus_symtable_get_from_string($9,5409)|0);
 $26 = $116;
 $117 = $12;
 $27 = $117;
 $118 = $26;
 $119 = $27;
 HEAP32[$vararg_buffer61>>2] = $118;
 $vararg_ptr64 = ((($vararg_buffer61)) + 4|0);
 HEAP32[$vararg_ptr64>>2] = $119;
 (_printf(3084,$vararg_buffer61)|0);
 $120 = $26;
 $121 = $27;
 $122 = ($120|0)==($121|0);
 if (!($122)) {
  (_printf(2565,$vararg_buffer65)|0);
  $123 = $8;
  $124 = (($123) + 1)|0;
  $8 = $124;
 }
 $125 = (_fus_symtable_add_from_string($9,6029)|0);
 $28 = $125;
 (_printf(6040,$vararg_buffer67)|0);
 $126 = $7;
 $127 = (($126) + 1)|0;
 $7 = $127;
 $128 = (_fus_symtable_len($9)|0);
 $29 = $128;
 $30 = 3;
 $129 = $29;
 $130 = $30;
 HEAP32[$vararg_buffer69>>2] = $129;
 $vararg_ptr72 = ((($vararg_buffer69)) + 4|0);
 HEAP32[$vararg_ptr72>>2] = $130;
 (_printf(3084,$vararg_buffer69)|0);
 $131 = $29;
 $132 = $30;
 $133 = ($131|0)==($132|0);
 if (!($133)) {
  (_printf(2565,$vararg_buffer73)|0);
  $134 = $8;
  $135 = (($134) + 1)|0;
  $8 = $135;
 }
 (_printf(6073,$vararg_buffer75)|0);
 $136 = $7;
 $137 = (($136) + 1)|0;
 $7 = $137;
 $138 = (_fus_symtable_get_from_string($9,6128)|0);
 $31 = $138;
 $32 = -1;
 $139 = $31;
 $140 = $32;
 HEAP32[$vararg_buffer77>>2] = $139;
 $vararg_ptr80 = ((($vararg_buffer77)) + 4|0);
 HEAP32[$vararg_ptr80>>2] = $140;
 (_printf(3084,$vararg_buffer77)|0);
 $141 = $31;
 $142 = $32;
 $143 = ($141|0)==($142|0);
 if (!($143)) {
  (_printf(2565,$vararg_buffer81)|0);
  $144 = $8;
  $145 = (($144) + 1)|0;
  $8 = $145;
 }
 (_printf(6134,$vararg_buffer83)|0);
 $146 = $7;
 $147 = (($146) + 1)|0;
 $7 = $147;
 $148 = (_fus_symtable_get_from_string($9,6196)|0);
 $33 = $148;
 $34 = -1;
 $149 = $33;
 $150 = $34;
 HEAP32[$vararg_buffer85>>2] = $149;
 $vararg_ptr88 = ((($vararg_buffer85)) + 4|0);
 HEAP32[$vararg_ptr88>>2] = $150;
 (_printf(3084,$vararg_buffer85)|0);
 $151 = $33;
 $152 = $34;
 $153 = ($151|0)==($152|0);
 if (!($153)) {
  (_printf(2565,$vararg_buffer89)|0);
  $154 = $8;
  $155 = (($154) + 1)|0;
  $8 = $155;
 }
 (_printf(6209,$vararg_buffer91)|0);
 $156 = $7;
 $157 = (($156) + 1)|0;
 $7 = $157;
 $158 = (_fus_symtable_get_from_string($9,6029)|0);
 $35 = $158;
 $159 = $28;
 $36 = $159;
 $160 = $35;
 $161 = $36;
 HEAP32[$vararg_buffer93>>2] = $160;
 $vararg_ptr96 = ((($vararg_buffer93)) + 4|0);
 HEAP32[$vararg_ptr96>>2] = $161;
 (_printf(3084,$vararg_buffer93)|0);
 $162 = $35;
 $163 = $36;
 $164 = ($162|0)==($163|0);
 if ($164) {
  _fus_symtable_cleanup($9);
  $167 = $6;
  HEAP32[$vararg_buffer99>>2] = $167;
  (_printf(3098,$vararg_buffer99)|0);
  $168 = $7;
  $169 = $8;
  $170 = (($168) - ($169))|0;
  $171 = $7;
  $172 = $8;
  $173 = ($172|0)==(0);
  $174 = $173 ? 3107 : 3110;
  HEAP32[$vararg_buffer102>>2] = $170;
  $vararg_ptr105 = ((($vararg_buffer102)) + 4|0);
  HEAP32[$vararg_ptr105>>2] = $171;
  $vararg_ptr106 = ((($vararg_buffer102)) + 8|0);
  HEAP32[$vararg_ptr106>>2] = $174;
  (_printf(3115,$vararg_buffer102)|0);
  (_printf(2401,$vararg_buffer107)|0);
  (_printf(3141,$vararg_buffer109)|0);
  $175 = $7;
  $176 = $4;
  $177 = HEAP32[$176>>2]|0;
  $178 = (($177) + ($175))|0;
  HEAP32[$176>>2] = $178;
  $179 = $8;
  $180 = $5;
  $181 = HEAP32[$180>>2]|0;
  $182 = (($181) + ($179))|0;
  HEAP32[$180>>2] = $182;
  STACKTOP = sp;return;
 }
 (_printf(2565,$vararg_buffer97)|0);
 $165 = $8;
 $166 = (($165) + 1)|0;
 $8 = $166;
 _fus_symtable_cleanup($9);
 $167 = $6;
 HEAP32[$vararg_buffer99>>2] = $167;
 (_printf(3098,$vararg_buffer99)|0);
 $168 = $7;
 $169 = $8;
 $170 = (($168) - ($169))|0;
 $171 = $7;
 $172 = $8;
 $173 = ($172|0)==(0);
 $174 = $173 ? 3107 : 3110;
 HEAP32[$vararg_buffer102>>2] = $170;
 $vararg_ptr105 = ((($vararg_buffer102)) + 4|0);
 HEAP32[$vararg_ptr105>>2] = $171;
 $vararg_ptr106 = ((($vararg_buffer102)) + 8|0);
 HEAP32[$vararg_ptr106>>2] = $174;
 (_printf(3115,$vararg_buffer102)|0);
 (_printf(2401,$vararg_buffer107)|0);
 (_printf(3141,$vararg_buffer109)|0);
 $175 = $7;
 $176 = $4;
 $177 = HEAP32[$176>>2]|0;
 $178 = (($177) + ($175))|0;
 HEAP32[$176>>2] = $178;
 $179 = $8;
 $180 = $5;
 $181 = HEAP32[$180>>2]|0;
 $182 = (($181) + ($179))|0;
 HEAP32[$180>>2] = $182;
 STACKTOP = sp;return;
}
function _run_symtable_tests_full($0,$1,$2) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 var $$byval_copy = 0, $$byval_copy47 = 0, $$byval_copy48 = 0, $$byval_copy49 = 0, $10 = 0, $100 = 0, $101 = 0, $102 = 0, $103 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $20 = 0, $21 = 0;
 var $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0, $29 = 0, $3 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $4 = 0;
 var $40 = 0, $41 = 0, $42 = 0, $43 = 0, $44 = 0, $45 = 0, $46 = 0, $47 = 0, $48 = 0, $49 = 0, $5 = 0, $50 = 0, $51 = 0, $52 = 0, $53 = 0, $54 = 0, $55 = 0, $56 = 0, $57 = 0, $58 = 0;
 var $59 = 0, $6 = 0, $60 = 0, $61 = 0, $62 = 0, $63 = 0, $64 = 0, $65 = 0, $66 = 0, $67 = 0, $68 = 0, $69 = 0, $7 = 0, $70 = 0, $71 = 0, $72 = 0, $73 = 0, $74 = 0, $75 = 0, $76 = 0;
 var $77 = 0, $78 = 0, $79 = 0, $8 = 0, $80 = 0, $81 = 0, $82 = 0, $83 = 0, $84 = 0, $85 = 0, $86 = 0, $87 = 0, $88 = 0, $89 = 0, $9 = 0, $90 = 0, $91 = 0, $92 = 0, $93 = 0, $94 = 0;
 var $95 = 0, $96 = 0, $97 = 0, $98 = 0, $99 = 0, $vararg_buffer = 0, $vararg_buffer1 = 0, $vararg_buffer11 = 0, $vararg_buffer13 = 0, $vararg_buffer17 = 0, $vararg_buffer19 = 0, $vararg_buffer21 = 0, $vararg_buffer25 = 0, $vararg_buffer27 = 0, $vararg_buffer29 = 0, $vararg_buffer3 = 0, $vararg_buffer33 = 0, $vararg_buffer35 = 0, $vararg_buffer38 = 0, $vararg_buffer43 = 0;
 var $vararg_buffer45 = 0, $vararg_buffer5 = 0, $vararg_buffer9 = 0, $vararg_ptr16 = 0, $vararg_ptr24 = 0, $vararg_ptr32 = 0, $vararg_ptr41 = 0, $vararg_ptr42 = 0, $vararg_ptr8 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 256|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(256|0);
 $$byval_copy49 = sp + 244|0;
 $$byval_copy48 = sp + 240|0;
 $$byval_copy47 = sp + 236|0;
 $$byval_copy = sp + 232|0;
 $vararg_buffer45 = sp + 144|0;
 $vararg_buffer43 = sp + 136|0;
 $vararg_buffer38 = sp + 120|0;
 $vararg_buffer35 = sp + 112|0;
 $vararg_buffer33 = sp + 104|0;
 $vararg_buffer29 = sp + 96|0;
 $vararg_buffer27 = sp + 88|0;
 $vararg_buffer25 = sp + 80|0;
 $vararg_buffer21 = sp + 72|0;
 $vararg_buffer19 = sp + 64|0;
 $vararg_buffer17 = sp + 56|0;
 $vararg_buffer13 = sp + 48|0;
 $vararg_buffer11 = sp + 40|0;
 $vararg_buffer9 = sp + 32|0;
 $vararg_buffer5 = sp + 24|0;
 $vararg_buffer3 = sp + 16|0;
 $vararg_buffer1 = sp + 8|0;
 $vararg_buffer = sp;
 $12 = sp + 192|0;
 $16 = sp + 176|0;
 $21 = sp + 156|0;
 $23 = sp + 148|0;
 $3 = $0;
 $4 = $1;
 $5 = $2;
 $6 = 6277;
 $7 = 0;
 $8 = 0;
 (_printf(2401,$vararg_buffer)|0);
 $24 = $6;
 HEAP32[$vararg_buffer1>>2] = $24;
 (_printf(2483,$vararg_buffer1)|0);
 $25 = $3;
 $26 = ((($25)) + 4|0);
 $27 = HEAP32[$26>>2]|0;
 $9 = $27;
 $28 = $9;
 $29 = (_fus_symtable_get_or_add_from_string($28,5409)|0);
 $10 = $29;
 (_printf(6299,$vararg_buffer3)|0);
 $30 = $7;
 $31 = (($30) + 1)|0;
 $7 = $31;
 $32 = $3;
 $33 = $3;
 $34 = $10;
 _fus_value_sym($12,$33,$34);
 ;HEAP32[$$byval_copy>>2]=HEAP32[$12>>2]|0;
 $35 = (_fus_value_sym_decode($32,$$byval_copy)|0);
 $11 = $35;
 $36 = $10;
 $13 = $36;
 $37 = $11;
 $38 = $13;
 HEAP32[$vararg_buffer5>>2] = $37;
 $vararg_ptr8 = ((($vararg_buffer5)) + 4|0);
 HEAP32[$vararg_ptr8>>2] = $38;
 (_printf(2549,$vararg_buffer5)|0);
 $39 = $11;
 $40 = $13;
 $41 = ($39|0)==($40|0);
 if (!($41)) {
  (_printf(2565,$vararg_buffer9)|0);
  $42 = $8;
  $43 = (($42) + 1)|0;
  $8 = $43;
 }
 $44 = $9;
 $45 = (_fus_symtable_get_or_add_from_string($44,5441)|0);
 $14 = $45;
 (_printf(6366,$vararg_buffer11)|0);
 $46 = $7;
 $47 = (($46) + 1)|0;
 $7 = $47;
 $48 = $3;
 $49 = $3;
 $50 = $14;
 _fus_value_sym($16,$49,$50);
 ;HEAP32[$$byval_copy47>>2]=HEAP32[$16>>2]|0;
 $51 = (_fus_value_sym_decode($48,$$byval_copy47)|0);
 $15 = $51;
 $52 = $14;
 $17 = $52;
 $53 = $15;
 $54 = $17;
 HEAP32[$vararg_buffer13>>2] = $53;
 $vararg_ptr16 = ((($vararg_buffer13)) + 4|0);
 HEAP32[$vararg_ptr16>>2] = $54;
 (_printf(2549,$vararg_buffer13)|0);
 $55 = $15;
 $56 = $17;
 $57 = ($55|0)==($56|0);
 if (!($57)) {
  (_printf(2565,$vararg_buffer17)|0);
  $58 = $8;
  $59 = (($58) + 1)|0;
  $8 = $59;
 }
 (_printf(5993,$vararg_buffer19)|0);
 $60 = $7;
 $61 = (($60) + 1)|0;
 $7 = $61;
 $62 = $10;
 $18 = $62;
 $63 = $14;
 $19 = $63;
 $64 = $18;
 $65 = $19;
 HEAP32[$vararg_buffer21>>2] = $64;
 $vararg_ptr24 = ((($vararg_buffer21)) + 4|0);
 HEAP32[$vararg_ptr24>>2] = $65;
 (_printf(6015,$vararg_buffer21)|0);
 $66 = $18;
 $67 = $19;
 $68 = ($66|0)!=($67|0);
 if (!($68)) {
  (_printf(2565,$vararg_buffer25)|0);
  $69 = $8;
  $70 = (($69) + 1)|0;
  $8 = $70;
 }
 (_printf(6433,$vararg_buffer27)|0);
 $71 = $7;
 $72 = (($71) + 1)|0;
 $7 = $72;
 $73 = $3;
 $74 = $3;
 $75 = $10;
 _fus_value_sym($21,$74,$75);
 ;HEAP32[$$byval_copy48>>2]=HEAP32[$21>>2]|0;
 $76 = (_fus_value_sym_decode($73,$$byval_copy48)|0);
 $20 = $76;
 $77 = $3;
 $78 = $3;
 $79 = $14;
 _fus_value_sym($23,$78,$79);
 ;HEAP32[$$byval_copy49>>2]=HEAP32[$23>>2]|0;
 $80 = (_fus_value_sym_decode($77,$$byval_copy49)|0);
 $22 = $80;
 $81 = $20;
 $82 = $22;
 HEAP32[$vararg_buffer29>>2] = $81;
 $vararg_ptr32 = ((($vararg_buffer29)) + 4|0);
 HEAP32[$vararg_ptr32>>2] = $82;
 (_printf(6545,$vararg_buffer29)|0);
 $83 = $20;
 $84 = $22;
 $85 = ($83|0)!=($84|0);
 if ($85) {
  $88 = $6;
  HEAP32[$vararg_buffer35>>2] = $88;
  (_printf(3098,$vararg_buffer35)|0);
  $89 = $7;
  $90 = $8;
  $91 = (($89) - ($90))|0;
  $92 = $7;
  $93 = $8;
  $94 = ($93|0)==(0);
  $95 = $94 ? 3107 : 3110;
  HEAP32[$vararg_buffer38>>2] = $91;
  $vararg_ptr41 = ((($vararg_buffer38)) + 4|0);
  HEAP32[$vararg_ptr41>>2] = $92;
  $vararg_ptr42 = ((($vararg_buffer38)) + 8|0);
  HEAP32[$vararg_ptr42>>2] = $95;
  (_printf(3115,$vararg_buffer38)|0);
  (_printf(2401,$vararg_buffer43)|0);
  (_printf(3141,$vararg_buffer45)|0);
  $96 = $7;
  $97 = $4;
  $98 = HEAP32[$97>>2]|0;
  $99 = (($98) + ($96))|0;
  HEAP32[$97>>2] = $99;
  $100 = $8;
  $101 = $5;
  $102 = HEAP32[$101>>2]|0;
  $103 = (($102) + ($100))|0;
  HEAP32[$101>>2] = $103;
  STACKTOP = sp;return;
 }
 (_printf(2565,$vararg_buffer33)|0);
 $86 = $8;
 $87 = (($86) + 1)|0;
 $8 = $87;
 $88 = $6;
 HEAP32[$vararg_buffer35>>2] = $88;
 (_printf(3098,$vararg_buffer35)|0);
 $89 = $7;
 $90 = $8;
 $91 = (($89) - ($90))|0;
 $92 = $7;
 $93 = $8;
 $94 = ($93|0)==(0);
 $95 = $94 ? 3107 : 3110;
 HEAP32[$vararg_buffer38>>2] = $91;
 $vararg_ptr41 = ((($vararg_buffer38)) + 4|0);
 HEAP32[$vararg_ptr41>>2] = $92;
 $vararg_ptr42 = ((($vararg_buffer38)) + 8|0);
 HEAP32[$vararg_ptr42>>2] = $95;
 (_printf(3115,$vararg_buffer38)|0);
 (_printf(2401,$vararg_buffer43)|0);
 (_printf(3141,$vararg_buffer45)|0);
 $96 = $7;
 $97 = $4;
 $98 = HEAP32[$97>>2]|0;
 $99 = (($98) + ($96))|0;
 HEAP32[$97>>2] = $99;
 $100 = $8;
 $101 = $5;
 $102 = HEAP32[$101>>2]|0;
 $103 = (($102) + ($100))|0;
 HEAP32[$101>>2] = $103;
 STACKTOP = sp;return;
}
function _run_obj_tests_basic($0,$1,$2) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 var $$byval_copy = 0, $$byval_copy67 = 0, $$byval_copy68 = 0, $$byval_copy69 = 0, $$byval_copy70 = 0, $$byval_copy71 = 0, $$byval_copy72 = 0, $$byval_copy73 = 0, $$byval_copy74 = 0, $$byval_copy75 = 0, $$byval_copy76 = 0, $$byval_copy77 = 0, $10 = 0, $100 = 0, $101 = 0, $102 = 0, $103 = 0, $104 = 0, $105 = 0, $106 = 0;
 var $107 = 0, $108 = 0, $109 = 0, $11 = 0, $110 = 0, $111 = 0, $112 = 0, $113 = 0, $114 = 0, $115 = 0, $116 = 0, $117 = 0, $118 = 0, $119 = 0, $12 = 0, $120 = 0, $121 = 0, $122 = 0, $123 = 0, $124 = 0;
 var $125 = 0, $126 = 0, $127 = 0, $128 = 0, $129 = 0, $13 = 0, $130 = 0, $131 = 0, $132 = 0, $133 = 0, $134 = 0, $135 = 0, $136 = 0, $137 = 0, $138 = 0, $139 = 0, $14 = 0, $140 = 0, $141 = 0, $142 = 0;
 var $143 = 0, $144 = 0, $145 = 0, $146 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0, $29 = 0, $3 = 0;
 var $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $4 = 0, $40 = 0, $41 = 0, $42 = 0, $43 = 0, $44 = 0, $45 = 0, $46 = 0, $47 = 0, $48 = 0;
 var $49 = 0, $5 = 0, $50 = 0, $51 = 0, $52 = 0, $53 = 0, $54 = 0, $55 = 0, $56 = 0, $57 = 0, $58 = 0, $59 = 0, $6 = 0, $60 = 0, $61 = 0, $62 = 0, $63 = 0, $64 = 0, $65 = 0, $66 = 0;
 var $67 = 0, $68 = 0, $69 = 0, $7 = 0, $70 = 0, $71 = 0, $72 = 0, $73 = 0, $74 = 0, $75 = 0, $76 = 0, $77 = 0, $78 = 0, $79 = 0, $8 = 0, $80 = 0, $81 = 0, $82 = 0, $83 = 0, $84 = 0;
 var $85 = 0, $86 = 0, $87 = 0, $88 = 0, $89 = 0, $9 = 0, $90 = 0, $91 = 0, $92 = 0, $93 = 0, $94 = 0, $95 = 0, $96 = 0, $97 = 0, $98 = 0, $99 = 0, $vararg_buffer = 0, $vararg_buffer1 = 0, $vararg_buffer13 = 0, $vararg_buffer15 = 0;
 var $vararg_buffer17 = 0, $vararg_buffer21 = 0, $vararg_buffer23 = 0, $vararg_buffer25 = 0, $vararg_buffer29 = 0, $vararg_buffer3 = 0, $vararg_buffer31 = 0, $vararg_buffer33 = 0, $vararg_buffer37 = 0, $vararg_buffer39 = 0, $vararg_buffer41 = 0, $vararg_buffer45 = 0, $vararg_buffer47 = 0, $vararg_buffer49 = 0, $vararg_buffer5 = 0, $vararg_buffer53 = 0, $vararg_buffer55 = 0, $vararg_buffer58 = 0, $vararg_buffer63 = 0, $vararg_buffer65 = 0;
 var $vararg_buffer7 = 0, $vararg_buffer9 = 0, $vararg_ptr12 = 0, $vararg_ptr20 = 0, $vararg_ptr28 = 0, $vararg_ptr36 = 0, $vararg_ptr44 = 0, $vararg_ptr52 = 0, $vararg_ptr61 = 0, $vararg_ptr62 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 4512|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(4512|0);
 $$byval_copy77 = sp + 4504|0;
 $$byval_copy76 = sp + 4500|0;
 $$byval_copy75 = sp + 4496|0;
 $$byval_copy74 = sp + 4492|0;
 $$byval_copy73 = sp + 4488|0;
 $$byval_copy72 = sp + 4484|0;
 $$byval_copy71 = sp + 4480|0;
 $$byval_copy70 = sp + 4476|0;
 $$byval_copy69 = sp + 4472|0;
 $$byval_copy68 = sp + 4468|0;
 $$byval_copy67 = sp + 4464|0;
 $$byval_copy = sp + 4460|0;
 $vararg_buffer65 = sp + 208|0;
 $vararg_buffer63 = sp + 200|0;
 $vararg_buffer58 = sp + 184|0;
 $vararg_buffer55 = sp + 176|0;
 $vararg_buffer53 = sp + 168|0;
 $vararg_buffer49 = sp + 160|0;
 $vararg_buffer47 = sp + 152|0;
 $vararg_buffer45 = sp + 144|0;
 $vararg_buffer41 = sp + 136|0;
 $vararg_buffer39 = sp + 128|0;
 $vararg_buffer37 = sp + 120|0;
 $vararg_buffer33 = sp + 112|0;
 $vararg_buffer31 = sp + 104|0;
 $vararg_buffer29 = sp + 96|0;
 $vararg_buffer25 = sp + 88|0;
 $vararg_buffer23 = sp + 80|0;
 $vararg_buffer21 = sp + 72|0;
 $vararg_buffer17 = sp + 64|0;
 $vararg_buffer15 = sp + 56|0;
 $vararg_buffer13 = sp + 48|0;
 $vararg_buffer9 = sp + 40|0;
 $vararg_buffer7 = sp + 32|0;
 $vararg_buffer5 = sp + 24|0;
 $vararg_buffer3 = sp + 16|0;
 $vararg_buffer1 = sp + 8|0;
 $vararg_buffer = sp;
 $12 = sp + 4420|0;
 $13 = sp + 4416|0;
 $14 = sp + 4412|0;
 $15 = sp + 280|0;
 $17 = sp + 272|0;
 $20 = sp + 260|0;
 $22 = sp + 252|0;
 $24 = sp + 244|0;
 $27 = sp + 232|0;
 $3 = $0;
 $4 = $1;
 $5 = $2;
 $6 = 6561;
 $7 = 0;
 $8 = 0;
 (_printf(2401,$vararg_buffer)|0);
 $33 = $6;
 HEAP32[$vararg_buffer1>>2] = $33;
 (_printf(2483,$vararg_buffer1)|0);
 $34 = $3;
 $35 = ((($34)) + 4|0);
 $36 = HEAP32[$35>>2]|0;
 $9 = $36;
 $37 = $9;
 $38 = (_fus_symtable_get_or_add_from_string($37,5409)|0);
 $10 = $38;
 $39 = $9;
 $40 = (_fus_symtable_get_or_add_from_string($39,5441)|0);
 $11 = $40;
 $41 = $3;
 _fus_value_obj($12,$41);
 $42 = $3;
 $43 = $10;
 $44 = $3;
 _fus_value_int($13,$44,10);
 ;HEAP32[$$byval_copy>>2]=HEAP32[$13>>2]|0;
 _fus_value_obj_set($42,$12,$43,$$byval_copy);
 $45 = $3;
 $46 = $11;
 $47 = $3;
 _fus_value_int($14,$47,20);
 ;HEAP32[$$byval_copy67>>2]=HEAP32[$14>>2]|0;
 _fus_value_obj_set($45,$12,$46,$$byval_copy67);
 _fus_printer_init($15);
 (_printf(6579,$vararg_buffer3)|0);
 $48 = $3;
 $49 = HEAP32[$12>>2]|0;
 $50 = ((($49)) + 12|0);
 (_fus_printer_print_obj($15,$48,$50)|0);
 (_printf(3141,$vararg_buffer5)|0);
 _fus_printer_cleanup($15);
 (_printf(6593,$vararg_buffer7)|0);
 $51 = $7;
 $52 = (($51) + 1)|0;
 $7 = $52;
 $53 = $3;
 $54 = $3;
 $55 = $10;
 ;HEAP32[$$byval_copy68>>2]=HEAP32[$12>>2]|0;
 _fus_value_obj_get($17,$54,$$byval_copy68,$55);
 ;HEAP32[$$byval_copy69>>2]=HEAP32[$17>>2]|0;
 $56 = (_fus_value_int_decode($53,$$byval_copy69)|0);
 $16 = $56;
 $18 = 10;
 $57 = $16;
 $58 = $18;
 HEAP32[$vararg_buffer9>>2] = $57;
 $vararg_ptr12 = ((($vararg_buffer9)) + 4|0);
 HEAP32[$vararg_ptr12>>2] = $58;
 (_printf(3084,$vararg_buffer9)|0);
 $59 = $16;
 $60 = $18;
 $61 = ($59|0)==($60|0);
 if (!($61)) {
  (_printf(2565,$vararg_buffer13)|0);
  $62 = $8;
  $63 = (($62) + 1)|0;
  $8 = $63;
 }
 (_printf(6658,$vararg_buffer15)|0);
 $64 = $7;
 $65 = (($64) + 1)|0;
 $7 = $65;
 $66 = $3;
 $67 = $3;
 $68 = $11;
 ;HEAP32[$$byval_copy70>>2]=HEAP32[$12>>2]|0;
 _fus_value_obj_get($20,$67,$$byval_copy70,$68);
 ;HEAP32[$$byval_copy71>>2]=HEAP32[$20>>2]|0;
 $69 = (_fus_value_int_decode($66,$$byval_copy71)|0);
 $19 = $69;
 $21 = 20;
 $70 = $19;
 $71 = $21;
 HEAP32[$vararg_buffer17>>2] = $70;
 $vararg_ptr20 = ((($vararg_buffer17)) + 4|0);
 HEAP32[$vararg_ptr20>>2] = $71;
 (_printf(3084,$vararg_buffer17)|0);
 $72 = $19;
 $73 = $21;
 $74 = ($72|0)==($73|0);
 if (!($74)) {
  (_printf(2565,$vararg_buffer21)|0);
  $75 = $8;
  $76 = (($75) + 1)|0;
  $8 = $76;
 }
 $77 = $3;
 $78 = $10;
 $79 = $3;
 _fus_value_int($22,$79,30);
 ;HEAP32[$$byval_copy72>>2]=HEAP32[$22>>2]|0;
 _fus_value_obj_set($77,$12,$78,$$byval_copy72);
 (_printf(6723,$vararg_buffer23)|0);
 $80 = $7;
 $81 = (($80) + 1)|0;
 $7 = $81;
 $82 = $3;
 $83 = $3;
 $84 = $10;
 ;HEAP32[$$byval_copy73>>2]=HEAP32[$12>>2]|0;
 _fus_value_obj_get($24,$83,$$byval_copy73,$84);
 ;HEAP32[$$byval_copy74>>2]=HEAP32[$24>>2]|0;
 $85 = (_fus_value_int_decode($82,$$byval_copy74)|0);
 $23 = $85;
 $25 = 30;
 $86 = $23;
 $87 = $25;
 HEAP32[$vararg_buffer25>>2] = $86;
 $vararg_ptr28 = ((($vararg_buffer25)) + 4|0);
 HEAP32[$vararg_ptr28>>2] = $87;
 (_printf(3084,$vararg_buffer25)|0);
 $88 = $23;
 $89 = $25;
 $90 = ($88|0)==($89|0);
 if (!($90)) {
  (_printf(2565,$vararg_buffer29)|0);
  $91 = $8;
  $92 = (($91) + 1)|0;
  $8 = $92;
 }
 (_printf(6658,$vararg_buffer31)|0);
 $93 = $7;
 $94 = (($93) + 1)|0;
 $7 = $94;
 $95 = $3;
 $96 = $3;
 $97 = $11;
 ;HEAP32[$$byval_copy75>>2]=HEAP32[$12>>2]|0;
 _fus_value_obj_get($27,$96,$$byval_copy75,$97);
 ;HEAP32[$$byval_copy76>>2]=HEAP32[$27>>2]|0;
 $98 = (_fus_value_int_decode($95,$$byval_copy76)|0);
 $26 = $98;
 $28 = 20;
 $99 = $26;
 $100 = $28;
 HEAP32[$vararg_buffer33>>2] = $99;
 $vararg_ptr36 = ((($vararg_buffer33)) + 4|0);
 HEAP32[$vararg_ptr36>>2] = $100;
 (_printf(3084,$vararg_buffer33)|0);
 $101 = $26;
 $102 = $28;
 $103 = ($101|0)==($102|0);
 if (!($103)) {
  (_printf(2565,$vararg_buffer37)|0);
  $104 = $8;
  $105 = (($104) + 1)|0;
  $8 = $105;
 }
 (_printf(4010,$vararg_buffer39)|0);
 $106 = $7;
 $107 = (($106) + 1)|0;
 $7 = $107;
 $108 = $3;
 $109 = ((($108)) + 8|0);
 $110 = HEAP32[$109>>2]|0;
 $29 = $110;
 $30 = 1;
 $111 = $29;
 $112 = $30;
 HEAP32[$vararg_buffer41>>2] = $111;
 $vararg_ptr44 = ((($vararg_buffer41)) + 4|0);
 HEAP32[$vararg_ptr44>>2] = $112;
 (_printf(3084,$vararg_buffer41)|0);
 $113 = $29;
 $114 = $30;
 $115 = ($113|0)==($114|0);
 if (!($115)) {
  (_printf(2565,$vararg_buffer45)|0);
  $116 = $8;
  $117 = (($116) + 1)|0;
  $8 = $117;
 }
 $118 = $3;
 ;HEAP32[$$byval_copy77>>2]=HEAP32[$12>>2]|0;
 _fus_value_detach($118,$$byval_copy77);
 (_printf(3064,$vararg_buffer47)|0);
 $119 = $7;
 $120 = (($119) + 1)|0;
 $7 = $120;
 $121 = $3;
 $122 = ((($121)) + 8|0);
 $123 = HEAP32[$122>>2]|0;
 $31 = $123;
 $32 = 0;
 $124 = $31;
 $125 = $32;
 HEAP32[$vararg_buffer49>>2] = $124;
 $vararg_ptr52 = ((($vararg_buffer49)) + 4|0);
 HEAP32[$vararg_ptr52>>2] = $125;
 (_printf(3084,$vararg_buffer49)|0);
 $126 = $31;
 $127 = $32;
 $128 = ($126|0)==($127|0);
 if ($128) {
  $131 = $6;
  HEAP32[$vararg_buffer55>>2] = $131;
  (_printf(3098,$vararg_buffer55)|0);
  $132 = $7;
  $133 = $8;
  $134 = (($132) - ($133))|0;
  $135 = $7;
  $136 = $8;
  $137 = ($136|0)==(0);
  $138 = $137 ? 3107 : 3110;
  HEAP32[$vararg_buffer58>>2] = $134;
  $vararg_ptr61 = ((($vararg_buffer58)) + 4|0);
  HEAP32[$vararg_ptr61>>2] = $135;
  $vararg_ptr62 = ((($vararg_buffer58)) + 8|0);
  HEAP32[$vararg_ptr62>>2] = $138;
  (_printf(3115,$vararg_buffer58)|0);
  (_printf(2401,$vararg_buffer63)|0);
  (_printf(3141,$vararg_buffer65)|0);
  $139 = $7;
  $140 = $4;
  $141 = HEAP32[$140>>2]|0;
  $142 = (($141) + ($139))|0;
  HEAP32[$140>>2] = $142;
  $143 = $8;
  $144 = $5;
  $145 = HEAP32[$144>>2]|0;
  $146 = (($145) + ($143))|0;
  HEAP32[$144>>2] = $146;
  STACKTOP = sp;return;
 }
 (_printf(2565,$vararg_buffer53)|0);
 $129 = $8;
 $130 = (($129) + 1)|0;
 $8 = $130;
 $131 = $6;
 HEAP32[$vararg_buffer55>>2] = $131;
 (_printf(3098,$vararg_buffer55)|0);
 $132 = $7;
 $133 = $8;
 $134 = (($132) - ($133))|0;
 $135 = $7;
 $136 = $8;
 $137 = ($136|0)==(0);
 $138 = $137 ? 3107 : 3110;
 HEAP32[$vararg_buffer58>>2] = $134;
 $vararg_ptr61 = ((($vararg_buffer58)) + 4|0);
 HEAP32[$vararg_ptr61>>2] = $135;
 $vararg_ptr62 = ((($vararg_buffer58)) + 8|0);
 HEAP32[$vararg_ptr62>>2] = $138;
 (_printf(3115,$vararg_buffer58)|0);
 (_printf(2401,$vararg_buffer63)|0);
 (_printf(3141,$vararg_buffer65)|0);
 $139 = $7;
 $140 = $4;
 $141 = HEAP32[$140>>2]|0;
 $142 = (($141) + ($139))|0;
 HEAP32[$140>>2] = $142;
 $143 = $8;
 $144 = $5;
 $145 = HEAP32[$144>>2]|0;
 $146 = (($145) + ($143))|0;
 HEAP32[$144>>2] = $146;
 STACKTOP = sp;return;
}
function _run_parser_tests_basic($0,$1,$2) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 var $$byval_copy = 0, $$byval_copy116 = 0, $$byval_copy117 = 0, $$byval_copy118 = 0, $$byval_copy119 = 0, $$byval_copy120 = 0, $$byval_copy121 = 0, $$byval_copy122 = 0, $$byval_copy123 = 0, $$byval_copy124 = 0, $$byval_copy125 = 0, $$byval_copy126 = 0, $$byval_copy127 = 0, $$byval_copy128 = 0, $$byval_copy129 = 0, $10 = 0, $100 = 0, $101 = 0, $102 = 0, $103 = 0;
 var $104 = 0, $105 = 0, $106 = 0, $107 = 0, $108 = 0, $109 = 0, $11 = 0, $110 = 0, $111 = 0, $112 = 0, $113 = 0, $114 = 0, $115 = 0, $116 = 0, $117 = 0, $118 = 0, $119 = 0, $12 = 0, $120 = 0, $121 = 0;
 var $122 = 0, $123 = 0, $124 = 0, $125 = 0, $126 = 0, $127 = 0, $128 = 0, $129 = 0, $13 = 0, $130 = 0, $131 = 0, $132 = 0, $133 = 0, $134 = 0, $135 = 0, $136 = 0, $137 = 0, $138 = 0, $139 = 0, $14 = 0;
 var $140 = 0, $141 = 0, $142 = 0, $143 = 0, $144 = 0, $145 = 0, $146 = 0, $147 = 0, $148 = 0, $149 = 0, $15 = 0, $150 = 0, $151 = 0, $152 = 0, $153 = 0, $154 = 0, $155 = 0, $156 = 0, $157 = 0, $158 = 0;
 var $159 = 0, $16 = 0, $160 = 0, $161 = 0, $162 = 0, $163 = 0, $164 = 0, $165 = 0, $166 = 0, $167 = 0, $168 = 0, $169 = 0, $17 = 0, $170 = 0, $171 = 0, $172 = 0, $173 = 0, $174 = 0, $175 = 0, $176 = 0;
 var $177 = 0, $178 = 0, $179 = 0, $18 = 0, $180 = 0, $181 = 0, $182 = 0, $183 = 0, $184 = 0, $185 = 0, $186 = 0, $187 = 0, $188 = 0, $189 = 0, $19 = 0, $190 = 0, $191 = 0, $192 = 0, $193 = 0, $194 = 0;
 var $195 = 0, $196 = 0, $197 = 0, $198 = 0, $199 = 0, $20 = 0, $200 = 0, $201 = 0, $202 = 0, $203 = 0, $204 = 0, $205 = 0, $206 = 0, $207 = 0, $208 = 0, $209 = 0, $21 = 0, $210 = 0, $211 = 0, $212 = 0;
 var $213 = 0, $214 = 0, $215 = 0, $216 = 0, $217 = 0, $218 = 0, $219 = 0, $22 = 0, $220 = 0, $221 = 0, $222 = 0, $223 = 0, $224 = 0, $225 = 0, $226 = 0, $227 = 0, $228 = 0, $229 = 0, $23 = 0, $230 = 0;
 var $231 = 0, $232 = 0, $233 = 0, $234 = 0, $235 = 0, $236 = 0, $237 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0, $29 = 0, $3 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0;
 var $36 = 0, $37 = 0, $38 = 0, $39 = 0, $4 = 0, $40 = 0, $41 = 0, $42 = 0, $43 = 0, $44 = 0, $45 = 0, $46 = 0, $47 = 0, $48 = 0, $49 = 0, $5 = 0, $50 = 0, $51 = 0, $52 = 0, $53 = 0;
 var $54 = 0, $55 = 0, $56 = 0, $57 = 0, $58 = 0, $59 = 0, $6 = 0, $60 = 0, $61 = 0, $62 = 0, $63 = 0, $64 = 0, $65 = 0, $66 = 0, $67 = 0, $68 = 0, $69 = 0, $7 = 0, $70 = 0, $71 = 0;
 var $72 = 0, $73 = 0, $74 = 0, $75 = 0, $76 = 0, $77 = 0, $78 = 0, $79 = 0, $8 = 0, $80 = 0, $81 = 0, $82 = 0, $83 = 0, $84 = 0, $85 = 0, $86 = 0, $87 = 0, $88 = 0, $89 = 0, $9 = 0;
 var $90 = 0, $91 = 0, $92 = 0, $93 = 0, $94 = 0, $95 = 0, $96 = 0, $97 = 0, $98 = 0, $99 = 0, $or$cond = 0, $or$cond3 = 0, $or$cond5 = 0, $vararg_buffer = 0, $vararg_buffer10 = 0, $vararg_buffer100 = 0, $vararg_buffer102 = 0, $vararg_buffer104 = 0, $vararg_buffer107 = 0, $vararg_buffer112 = 0;
 var $vararg_buffer114 = 0, $vararg_buffer14 = 0, $vararg_buffer16 = 0, $vararg_buffer18 = 0, $vararg_buffer22 = 0, $vararg_buffer24 = 0, $vararg_buffer26 = 0, $vararg_buffer30 = 0, $vararg_buffer32 = 0, $vararg_buffer34 = 0, $vararg_buffer38 = 0, $vararg_buffer40 = 0, $vararg_buffer42 = 0, $vararg_buffer46 = 0, $vararg_buffer48 = 0, $vararg_buffer50 = 0, $vararg_buffer54 = 0, $vararg_buffer56 = 0, $vararg_buffer58 = 0, $vararg_buffer6 = 0;
 var $vararg_buffer62 = 0, $vararg_buffer64 = 0, $vararg_buffer66 = 0, $vararg_buffer70 = 0, $vararg_buffer72 = 0, $vararg_buffer74 = 0, $vararg_buffer78 = 0, $vararg_buffer8 = 0, $vararg_buffer80 = 0, $vararg_buffer82 = 0, $vararg_buffer84 = 0, $vararg_buffer86 = 0, $vararg_buffer88 = 0, $vararg_buffer90 = 0, $vararg_buffer92 = 0, $vararg_buffer94 = 0, $vararg_buffer96 = 0, $vararg_buffer98 = 0, $vararg_ptr110 = 0, $vararg_ptr111 = 0;
 var $vararg_ptr13 = 0, $vararg_ptr21 = 0, $vararg_ptr29 = 0, $vararg_ptr37 = 0, $vararg_ptr45 = 0, $vararg_ptr53 = 0, $vararg_ptr61 = 0, $vararg_ptr69 = 0, $vararg_ptr77 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 592|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(592|0);
 $$byval_copy129 = sp + 588|0;
 $$byval_copy128 = sp + 584|0;
 $$byval_copy127 = sp + 580|0;
 $$byval_copy126 = sp + 576|0;
 $$byval_copy125 = sp + 572|0;
 $$byval_copy124 = sp + 568|0;
 $$byval_copy123 = sp + 564|0;
 $$byval_copy122 = sp + 560|0;
 $$byval_copy121 = sp + 556|0;
 $$byval_copy120 = sp + 552|0;
 $$byval_copy119 = sp + 548|0;
 $$byval_copy118 = sp + 544|0;
 $$byval_copy117 = sp + 540|0;
 $$byval_copy116 = sp + 536|0;
 $$byval_copy = sp + 532|0;
 $vararg_buffer114 = sp + 360|0;
 $vararg_buffer112 = sp + 352|0;
 $vararg_buffer107 = sp + 336|0;
 $vararg_buffer104 = sp + 328|0;
 $vararg_buffer102 = sp + 320|0;
 $vararg_buffer100 = sp + 312|0;
 $vararg_buffer98 = sp + 304|0;
 $vararg_buffer96 = sp + 296|0;
 $vararg_buffer94 = sp + 288|0;
 $vararg_buffer92 = sp + 280|0;
 $vararg_buffer90 = sp + 272|0;
 $vararg_buffer88 = sp + 264|0;
 $vararg_buffer86 = sp + 256|0;
 $vararg_buffer84 = sp + 248|0;
 $vararg_buffer82 = sp + 240|0;
 $vararg_buffer80 = sp + 232|0;
 $vararg_buffer78 = sp + 224|0;
 $vararg_buffer74 = sp + 216|0;
 $vararg_buffer72 = sp + 208|0;
 $vararg_buffer70 = sp + 200|0;
 $vararg_buffer66 = sp + 192|0;
 $vararg_buffer64 = sp + 184|0;
 $vararg_buffer62 = sp + 176|0;
 $vararg_buffer58 = sp + 168|0;
 $vararg_buffer56 = sp + 160|0;
 $vararg_buffer54 = sp + 152|0;
 $vararg_buffer50 = sp + 144|0;
 $vararg_buffer48 = sp + 136|0;
 $vararg_buffer46 = sp + 128|0;
 $vararg_buffer42 = sp + 120|0;
 $vararg_buffer40 = sp + 112|0;
 $vararg_buffer38 = sp + 104|0;
 $vararg_buffer34 = sp + 96|0;
 $vararg_buffer32 = sp + 88|0;
 $vararg_buffer30 = sp + 80|0;
 $vararg_buffer26 = sp + 72|0;
 $vararg_buffer24 = sp + 64|0;
 $vararg_buffer22 = sp + 56|0;
 $vararg_buffer18 = sp + 48|0;
 $vararg_buffer16 = sp + 40|0;
 $vararg_buffer14 = sp + 32|0;
 $vararg_buffer10 = sp + 24|0;
 $vararg_buffer8 = sp + 16|0;
 $vararg_buffer6 = sp + 8|0;
 $vararg_buffer = sp;
 $10 = sp + 500|0;
 $13 = sp + 488|0;
 $16 = sp + 476|0;
 $19 = sp + 464|0;
 $22 = sp + 452|0;
 $25 = sp + 440|0;
 $28 = sp + 428|0;
 $31 = sp + 416|0;
 $34 = sp + 404|0;
 $36 = sp + 396|0;
 $39 = sp + 384|0;
 $42 = sp + 372|0;
 $3 = $0;
 $4 = $1;
 $5 = $2;
 $6 = 6788;
 $7 = 0;
 $8 = 0;
 (_printf(2401,$vararg_buffer)|0);
 $45 = $6;
 HEAP32[$vararg_buffer6>>2] = $45;
 (_printf(2483,$vararg_buffer6)|0);
 (_printf(6810,$vararg_buffer8)|0);
 $46 = $7;
 $47 = (($46) + 1)|0;
 $7 = $47;
 $48 = $3;
 $49 = $3;
 _fus_value_stringparse_int($10,$49,6879);
 ;HEAP32[$$byval_copy>>2]=HEAP32[$10>>2]|0;
 $50 = (_fus_value_int_decode($48,$$byval_copy)|0);
 $9 = $50;
 $11 = 0;
 $51 = $9;
 $52 = $11;
 HEAP32[$vararg_buffer10>>2] = $51;
 $vararg_ptr13 = ((($vararg_buffer10)) + 4|0);
 HEAP32[$vararg_ptr13>>2] = $52;
 (_printf(2549,$vararg_buffer10)|0);
 $53 = $9;
 $54 = $11;
 $55 = ($53|0)==($54|0);
 if (!($55)) {
  (_printf(2565,$vararg_buffer14)|0);
  $56 = $8;
  $57 = (($56) + 1)|0;
  $8 = $57;
 }
 (_printf(6881,$vararg_buffer16)|0);
 $58 = $7;
 $59 = (($58) + 1)|0;
 $7 = $59;
 $60 = $3;
 $61 = $3;
 _fus_value_stringparse_int($13,$61,5343);
 ;HEAP32[$$byval_copy116>>2]=HEAP32[$13>>2]|0;
 $62 = (_fus_value_int_decode($60,$$byval_copy116)|0);
 $12 = $62;
 $14 = 1;
 $63 = $12;
 $64 = $14;
 HEAP32[$vararg_buffer18>>2] = $63;
 $vararg_ptr21 = ((($vararg_buffer18)) + 4|0);
 HEAP32[$vararg_ptr21>>2] = $64;
 (_printf(2549,$vararg_buffer18)|0);
 $65 = $12;
 $66 = $14;
 $67 = ($65|0)==($66|0);
 if (!($67)) {
  (_printf(2565,$vararg_buffer22)|0);
  $68 = $8;
  $69 = (($68) + 1)|0;
  $8 = $69;
 }
 (_printf(6950,$vararg_buffer24)|0);
 $70 = $7;
 $71 = (($70) + 1)|0;
 $7 = $71;
 $72 = $3;
 $73 = $3;
 _fus_value_stringparse_int($16,$73,7021);
 ;HEAP32[$$byval_copy117>>2]=HEAP32[$16>>2]|0;
 $74 = (_fus_value_int_decode($72,$$byval_copy117)|0);
 $15 = $74;
 $17 = 10;
 $75 = $15;
 $76 = $17;
 HEAP32[$vararg_buffer26>>2] = $75;
 $vararg_ptr29 = ((($vararg_buffer26)) + 4|0);
 HEAP32[$vararg_ptr29>>2] = $76;
 (_printf(2549,$vararg_buffer26)|0);
 $77 = $15;
 $78 = $17;
 $79 = ($77|0)==($78|0);
 if (!($79)) {
  (_printf(2565,$vararg_buffer30)|0);
  $80 = $8;
  $81 = (($80) + 1)|0;
  $8 = $81;
 }
 (_printf(7024,$vararg_buffer32)|0);
 $82 = $7;
 $83 = (($82) + 1)|0;
 $7 = $83;
 $84 = $3;
 $85 = $3;
 _fus_value_stringparse_int($19,$85,7095);
 ;HEAP32[$$byval_copy118>>2]=HEAP32[$19>>2]|0;
 $86 = (_fus_value_int_decode($84,$$byval_copy118)|0);
 $18 = $86;
 $20 = 26;
 $87 = $18;
 $88 = $20;
 HEAP32[$vararg_buffer34>>2] = $87;
 $vararg_ptr37 = ((($vararg_buffer34)) + 4|0);
 HEAP32[$vararg_ptr37>>2] = $88;
 (_printf(2549,$vararg_buffer34)|0);
 $89 = $18;
 $90 = $20;
 $91 = ($89|0)==($90|0);
 if (!($91)) {
  (_printf(2565,$vararg_buffer38)|0);
  $92 = $8;
  $93 = (($92) + 1)|0;
  $8 = $93;
 }
 (_printf(7098,$vararg_buffer40)|0);
 $94 = $7;
 $95 = (($94) + 1)|0;
 $7 = $95;
 $96 = $3;
 $97 = $3;
 _fus_value_stringparse_int($22,$97,7171);
 ;HEAP32[$$byval_copy119>>2]=HEAP32[$22>>2]|0;
 $98 = (_fus_value_int_decode($96,$$byval_copy119)|0);
 $21 = $98;
 $23 = 999;
 $99 = $21;
 $100 = $23;
 HEAP32[$vararg_buffer42>>2] = $99;
 $vararg_ptr45 = ((($vararg_buffer42)) + 4|0);
 HEAP32[$vararg_ptr45>>2] = $100;
 (_printf(2549,$vararg_buffer42)|0);
 $101 = $21;
 $102 = $23;
 $103 = ($101|0)==($102|0);
 if (!($103)) {
  (_printf(2565,$vararg_buffer46)|0);
  $104 = $8;
  $105 = (($104) + 1)|0;
  $8 = $105;
 }
 (_printf(7175,$vararg_buffer48)|0);
 $106 = $7;
 $107 = (($106) + 1)|0;
 $7 = $107;
 $108 = $3;
 $109 = $3;
 _fus_value_stringparse_int($25,$109,7250);
 ;HEAP32[$$byval_copy120>>2]=HEAP32[$25>>2]|0;
 $110 = (_fus_value_int_decode($108,$$byval_copy120)|0);
 $24 = $110;
 $26 = -999;
 $111 = $24;
 $112 = $26;
 HEAP32[$vararg_buffer50>>2] = $111;
 $vararg_ptr53 = ((($vararg_buffer50)) + 4|0);
 HEAP32[$vararg_ptr53>>2] = $112;
 (_printf(2549,$vararg_buffer50)|0);
 $113 = $24;
 $114 = $26;
 $115 = ($113|0)==($114|0);
 if (!($115)) {
  (_printf(2565,$vararg_buffer54)|0);
  $116 = $8;
  $117 = (($116) + 1)|0;
  $8 = $117;
 }
 (_printf(7255,$vararg_buffer56)|0);
 $118 = $7;
 $119 = (($118) + 1)|0;
 $7 = $119;
 $120 = $3;
 $121 = $3;
 _fus_value_stringparse_int($28,$121,7325);
 ;HEAP32[$$byval_copy121>>2]=HEAP32[$28>>2]|0;
 $122 = (_fus_value_int_decode($120,$$byval_copy121)|0);
 $27 = $122;
 $29 = 0;
 $123 = $27;
 $124 = $29;
 HEAP32[$vararg_buffer58>>2] = $123;
 $vararg_ptr61 = ((($vararg_buffer58)) + 4|0);
 HEAP32[$vararg_ptr61>>2] = $124;
 (_printf(2549,$vararg_buffer58)|0);
 $125 = $27;
 $126 = $29;
 $127 = ($125|0)==($126|0);
 if (!($127)) {
  (_printf(2565,$vararg_buffer62)|0);
  $128 = $8;
  $129 = (($128) + 1)|0;
  $8 = $129;
 }
 (_printf(7328,$vararg_buffer64)|0);
 $130 = $7;
 $131 = (($130) + 1)|0;
 $7 = $131;
 $132 = $3;
 $133 = $3;
 _fus_value_stringparse_sym($31,$133,5409);
 ;HEAP32[$$byval_copy122>>2]=HEAP32[$31>>2]|0;
 $134 = (_fus_value_sym_decode($132,$$byval_copy122)|0);
 $30 = $134;
 $135 = $3;
 $136 = ((($135)) + 4|0);
 $137 = HEAP32[$136>>2]|0;
 $138 = (_fus_symtable_get_from_string($137,5409)|0);
 $32 = $138;
 $139 = $30;
 $140 = $32;
 HEAP32[$vararg_buffer66>>2] = $139;
 $vararg_ptr69 = ((($vararg_buffer66)) + 4|0);
 HEAP32[$vararg_ptr69>>2] = $140;
 (_printf(2549,$vararg_buffer66)|0);
 $141 = $30;
 $142 = $32;
 $143 = ($141|0)==($142|0);
 if (!($143)) {
  (_printf(2565,$vararg_buffer70)|0);
  $144 = $8;
  $145 = (($144) + 1)|0;
  $8 = $145;
 }
 (_printf(7443,$vararg_buffer72)|0);
 $146 = $7;
 $147 = (($146) + 1)|0;
 $7 = $147;
 $148 = $3;
 $149 = $3;
 _fus_value_stringparse_sym($34,$149,7574);
 ;HEAP32[$$byval_copy123>>2]=HEAP32[$34>>2]|0;
 $150 = (_fus_value_sym_decode($148,$$byval_copy123)|0);
 $33 = $150;
 $151 = $3;
 $152 = ((($151)) + 4|0);
 $153 = HEAP32[$152>>2]|0;
 $154 = (_fus_symtable_get_from_string($153,7574)|0);
 $35 = $154;
 $155 = $33;
 $156 = $35;
 HEAP32[$vararg_buffer74>>2] = $155;
 $vararg_ptr77 = ((($vararg_buffer74)) + 4|0);
 HEAP32[$vararg_ptr77>>2] = $156;
 (_printf(2549,$vararg_buffer74)|0);
 $157 = $33;
 $158 = $35;
 $159 = ($157|0)==($158|0);
 if (!($159)) {
  (_printf(2565,$vararg_buffer78)|0);
  $160 = $8;
  $161 = (($160) + 1)|0;
  $8 = $161;
 }
 $162 = $3;
 _fus_value_stringparse_str($36,$162,7584);
 $163 = $3;
 ;HEAP32[$$byval_copy124>>2]=HEAP32[$36>>2]|0;
 $164 = (_fus_value_str_decode($163,$$byval_copy124)|0);
 $37 = $164;
 $38 = 7590;
 (_printf(7594,$vararg_buffer80)|0);
 $165 = $7;
 $166 = (($165) + 1)|0;
 $7 = $166;
 $167 = $37;
 $168 = ($167|0)!=(0|0);
 $169 = $38;
 $170 = ($169|0)!=(0|0);
 $or$cond = $168 & $170;
 if ($or$cond) {
  $171 = $37;
  $172 = $38;
  $173 = (_strcmp($171,$172)|0);
  $174 = ($173|0)!=(0);
  if ($174) {
   label = 21;
  }
 } else {
  label = 21;
 }
 if ((label|0) == 21) {
  (_printf(2565,$vararg_buffer82)|0);
  $175 = $8;
  $176 = (($175) + 1)|0;
  $8 = $176;
 }
 $177 = $37;
 $178 = ($177|0)==(0|0);
 if ($178) {
  (_printf(7643,$vararg_buffer84)|0);
 }
 $179 = $38;
 $180 = ($179|0)==(0|0);
 if ($180) {
  (_printf(7666,$vararg_buffer86)|0);
 }
 $181 = $3;
 _fus_value_stringparse_str($39,$181,7689);
 $182 = $3;
 ;HEAP32[$$byval_copy125>>2]=HEAP32[$39>>2]|0;
 $183 = (_fus_value_str_decode($182,$$byval_copy125)|0);
 $40 = $183;
 $41 = 7702;
 (_printf(7712,$vararg_buffer88)|0);
 $184 = $7;
 $185 = (($184) + 1)|0;
 $7 = $185;
 $186 = $40;
 $187 = ($186|0)!=(0|0);
 $188 = $41;
 $189 = ($188|0)!=(0|0);
 $or$cond3 = $187 & $189;
 if ($or$cond3) {
  $190 = $40;
  $191 = $41;
  $192 = (_strcmp($190,$191)|0);
  $193 = ($192|0)!=(0);
  if ($193) {
   label = 28;
  }
 } else {
  label = 28;
 }
 if ((label|0) == 28) {
  (_printf(2565,$vararg_buffer90)|0);
  $194 = $8;
  $195 = (($194) + 1)|0;
  $8 = $195;
 }
 $196 = $40;
 $197 = ($196|0)==(0|0);
 if ($197) {
  (_printf(7643,$vararg_buffer92)|0);
 }
 $198 = $41;
 $199 = ($198|0)==(0|0);
 if ($199) {
  (_printf(7666,$vararg_buffer94)|0);
 }
 $200 = $3;
 _fus_value_stringparse_str($42,$200,7768);
 $201 = $3;
 ;HEAP32[$$byval_copy126>>2]=HEAP32[$42>>2]|0;
 $202 = (_fus_value_str_decode($201,$$byval_copy126)|0);
 $43 = $202;
 $44 = 7781;
 (_printf(7790,$vararg_buffer96)|0);
 $203 = $7;
 $204 = (($203) + 1)|0;
 $7 = $204;
 $205 = $43;
 $206 = ($205|0)!=(0|0);
 $207 = $44;
 $208 = ($207|0)!=(0|0);
 $or$cond5 = $206 & $208;
 if ($or$cond5) {
  $209 = $43;
  $210 = $44;
  $211 = (_strcmp($209,$210)|0);
  $212 = ($211|0)!=(0);
  if ($212) {
   label = 35;
  }
 } else {
  label = 35;
 }
 if ((label|0) == 35) {
  (_printf(2565,$vararg_buffer98)|0);
  $213 = $8;
  $214 = (($213) + 1)|0;
  $8 = $214;
 }
 $215 = $43;
 $216 = ($215|0)==(0|0);
 if ($216) {
  (_printf(7643,$vararg_buffer100)|0);
 }
 $217 = $44;
 $218 = ($217|0)==(0|0);
 if (!($218)) {
  $219 = $3;
  ;HEAP32[$$byval_copy127>>2]=HEAP32[$36>>2]|0;
  _fus_value_detach($219,$$byval_copy127);
  $220 = $3;
  ;HEAP32[$$byval_copy128>>2]=HEAP32[$39>>2]|0;
  _fus_value_detach($220,$$byval_copy128);
  $221 = $3;
  ;HEAP32[$$byval_copy129>>2]=HEAP32[$42>>2]|0;
  _fus_value_detach($221,$$byval_copy129);
  $222 = $6;
  HEAP32[$vararg_buffer104>>2] = $222;
  (_printf(3098,$vararg_buffer104)|0);
  $223 = $7;
  $224 = $8;
  $225 = (($223) - ($224))|0;
  $226 = $7;
  $227 = $8;
  $228 = ($227|0)==(0);
  $229 = $228 ? 3107 : 3110;
  HEAP32[$vararg_buffer107>>2] = $225;
  $vararg_ptr110 = ((($vararg_buffer107)) + 4|0);
  HEAP32[$vararg_ptr110>>2] = $226;
  $vararg_ptr111 = ((($vararg_buffer107)) + 8|0);
  HEAP32[$vararg_ptr111>>2] = $229;
  (_printf(3115,$vararg_buffer107)|0);
  (_printf(2401,$vararg_buffer112)|0);
  (_printf(3141,$vararg_buffer114)|0);
  $230 = $7;
  $231 = $4;
  $232 = HEAP32[$231>>2]|0;
  $233 = (($232) + ($230))|0;
  HEAP32[$231>>2] = $233;
  $234 = $8;
  $235 = $5;
  $236 = HEAP32[$235>>2]|0;
  $237 = (($236) + ($234))|0;
  HEAP32[$235>>2] = $237;
  STACKTOP = sp;return;
 }
 (_printf(7666,$vararg_buffer102)|0);
 $219 = $3;
 ;HEAP32[$$byval_copy127>>2]=HEAP32[$36>>2]|0;
 _fus_value_detach($219,$$byval_copy127);
 $220 = $3;
 ;HEAP32[$$byval_copy128>>2]=HEAP32[$39>>2]|0;
 _fus_value_detach($220,$$byval_copy128);
 $221 = $3;
 ;HEAP32[$$byval_copy129>>2]=HEAP32[$42>>2]|0;
 _fus_value_detach($221,$$byval_copy129);
 $222 = $6;
 HEAP32[$vararg_buffer104>>2] = $222;
 (_printf(3098,$vararg_buffer104)|0);
 $223 = $7;
 $224 = $8;
 $225 = (($223) - ($224))|0;
 $226 = $7;
 $227 = $8;
 $228 = ($227|0)==(0);
 $229 = $228 ? 3107 : 3110;
 HEAP32[$vararg_buffer107>>2] = $225;
 $vararg_ptr110 = ((($vararg_buffer107)) + 4|0);
 HEAP32[$vararg_ptr110>>2] = $226;
 $vararg_ptr111 = ((($vararg_buffer107)) + 8|0);
 HEAP32[$vararg_ptr111>>2] = $229;
 (_printf(3115,$vararg_buffer107)|0);
 (_printf(2401,$vararg_buffer112)|0);
 (_printf(3141,$vararg_buffer114)|0);
 $230 = $7;
 $231 = $4;
 $232 = HEAP32[$231>>2]|0;
 $233 = (($232) + ($230))|0;
 HEAP32[$231>>2] = $233;
 $234 = $8;
 $235 = $5;
 $236 = HEAP32[$235>>2]|0;
 $237 = (($236) + ($234))|0;
 HEAP32[$235>>2] = $237;
 STACKTOP = sp;return;
}
function _run_parser_tests_full($0,$1,$2) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 var $10 = 0, $100 = 0, $101 = 0, $102 = 0, $103 = 0, $104 = 0, $105 = 0, $106 = 0, $107 = 0, $108 = 0, $109 = 0, $11 = 0, $110 = 0, $111 = 0, $112 = 0, $113 = 0, $114 = 0, $115 = 0, $116 = 0, $117 = 0;
 var $118 = 0, $119 = 0, $12 = 0, $120 = 0, $121 = 0, $122 = 0, $123 = 0, $124 = 0, $125 = 0, $126 = 0, $127 = 0, $128 = 0, $129 = 0, $13 = 0, $130 = 0, $131 = 0, $132 = 0, $133 = 0, $134 = 0, $135 = 0;
 var $136 = 0, $137 = 0, $138 = 0, $139 = 0, $14 = 0, $140 = 0, $141 = 0, $142 = 0, $143 = 0, $144 = 0, $145 = 0, $146 = 0, $147 = 0, $148 = 0, $149 = 0, $15 = 0, $150 = 0, $151 = 0, $152 = 0, $153 = 0;
 var $154 = 0, $155 = 0, $156 = 0, $157 = 0, $158 = 0, $159 = 0, $16 = 0, $160 = 0, $161 = 0, $162 = 0, $163 = 0, $164 = 0, $165 = 0, $166 = 0, $167 = 0, $168 = 0, $169 = 0, $17 = 0, $170 = 0, $171 = 0;
 var $172 = 0, $173 = 0, $174 = 0, $175 = 0, $176 = 0, $177 = 0, $178 = 0, $179 = 0, $18 = 0, $180 = 0, $181 = 0, $182 = 0, $183 = 0, $184 = 0, $185 = 0, $186 = 0, $187 = 0, $188 = 0, $189 = 0, $19 = 0;
 var $190 = 0, $191 = 0, $192 = 0, $193 = 0, $194 = 0, $195 = 0, $196 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0, $29 = 0, $3 = 0, $30 = 0, $31 = 0;
 var $32 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $4 = 0, $40 = 0, $41 = 0, $42 = 0, $43 = 0, $44 = 0, $45 = 0, $46 = 0, $47 = 0, $48 = 0, $49 = 0, $5 = 0;
 var $50 = 0, $51 = 0, $52 = 0, $53 = 0, $54 = 0, $55 = 0, $56 = 0, $57 = 0, $58 = 0, $59 = 0, $6 = 0, $60 = 0, $61 = 0, $62 = 0, $63 = 0, $64 = 0, $65 = 0, $66 = 0, $67 = 0, $68 = 0;
 var $69 = 0, $7 = 0, $70 = 0, $71 = 0, $72 = 0, $73 = 0, $74 = 0, $75 = 0, $76 = 0, $77 = 0, $78 = 0, $79 = 0, $8 = 0, $80 = 0, $81 = 0, $82 = 0, $83 = 0, $84 = 0, $85 = 0, $86 = 0;
 var $87 = 0, $88 = 0, $89 = 0, $9 = 0, $90 = 0, $91 = 0, $92 = 0, $93 = 0, $94 = 0, $95 = 0, $96 = 0, $97 = 0, $98 = 0, $99 = 0, $vararg_buffer = 0, $vararg_buffer1 = 0, $vararg_buffer102 = 0, $vararg_buffer107 = 0, $vararg_buffer109 = 0, $vararg_buffer11 = 0;
 var $vararg_buffer13 = 0, $vararg_buffer17 = 0, $vararg_buffer19 = 0, $vararg_buffer21 = 0, $vararg_buffer25 = 0, $vararg_buffer27 = 0, $vararg_buffer29 = 0, $vararg_buffer3 = 0, $vararg_buffer33 = 0, $vararg_buffer35 = 0, $vararg_buffer37 = 0, $vararg_buffer41 = 0, $vararg_buffer43 = 0, $vararg_buffer45 = 0, $vararg_buffer49 = 0, $vararg_buffer5 = 0, $vararg_buffer51 = 0, $vararg_buffer53 = 0, $vararg_buffer57 = 0, $vararg_buffer59 = 0;
 var $vararg_buffer61 = 0, $vararg_buffer65 = 0, $vararg_buffer67 = 0, $vararg_buffer69 = 0, $vararg_buffer73 = 0, $vararg_buffer75 = 0, $vararg_buffer77 = 0, $vararg_buffer81 = 0, $vararg_buffer83 = 0, $vararg_buffer85 = 0, $vararg_buffer89 = 0, $vararg_buffer9 = 0, $vararg_buffer91 = 0, $vararg_buffer93 = 0, $vararg_buffer97 = 0, $vararg_buffer99 = 0, $vararg_ptr105 = 0, $vararg_ptr106 = 0, $vararg_ptr16 = 0, $vararg_ptr24 = 0;
 var $vararg_ptr32 = 0, $vararg_ptr40 = 0, $vararg_ptr48 = 0, $vararg_ptr56 = 0, $vararg_ptr64 = 0, $vararg_ptr72 = 0, $vararg_ptr8 = 0, $vararg_ptr80 = 0, $vararg_ptr88 = 0, $vararg_ptr96 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 496|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(496|0);
 $vararg_buffer109 = sp + 336|0;
 $vararg_buffer107 = sp + 328|0;
 $vararg_buffer102 = sp + 312|0;
 $vararg_buffer99 = sp + 304|0;
 $vararg_buffer97 = sp + 296|0;
 $vararg_buffer93 = sp + 288|0;
 $vararg_buffer91 = sp + 280|0;
 $vararg_buffer89 = sp + 272|0;
 $vararg_buffer85 = sp + 264|0;
 $vararg_buffer83 = sp + 256|0;
 $vararg_buffer81 = sp + 248|0;
 $vararg_buffer77 = sp + 240|0;
 $vararg_buffer75 = sp + 232|0;
 $vararg_buffer73 = sp + 224|0;
 $vararg_buffer69 = sp + 216|0;
 $vararg_buffer67 = sp + 208|0;
 $vararg_buffer65 = sp + 200|0;
 $vararg_buffer61 = sp + 192|0;
 $vararg_buffer59 = sp + 184|0;
 $vararg_buffer57 = sp + 176|0;
 $vararg_buffer53 = sp + 168|0;
 $vararg_buffer51 = sp + 160|0;
 $vararg_buffer49 = sp + 152|0;
 $vararg_buffer45 = sp + 144|0;
 $vararg_buffer43 = sp + 136|0;
 $vararg_buffer41 = sp + 128|0;
 $vararg_buffer37 = sp + 120|0;
 $vararg_buffer35 = sp + 112|0;
 $vararg_buffer33 = sp + 104|0;
 $vararg_buffer29 = sp + 96|0;
 $vararg_buffer27 = sp + 88|0;
 $vararg_buffer25 = sp + 80|0;
 $vararg_buffer21 = sp + 72|0;
 $vararg_buffer19 = sp + 64|0;
 $vararg_buffer17 = sp + 56|0;
 $vararg_buffer13 = sp + 48|0;
 $vararg_buffer11 = sp + 40|0;
 $vararg_buffer9 = sp + 32|0;
 $vararg_buffer5 = sp + 24|0;
 $vararg_buffer3 = sp + 16|0;
 $vararg_buffer1 = sp + 8|0;
 $vararg_buffer = sp;
 $9 = sp + 436|0;
 $3 = $0;
 $4 = $1;
 $5 = $2;
 $6 = 7846;
 $7 = 0;
 $8 = 0;
 (_printf(2401,$vararg_buffer)|0);
 $34 = $6;
 HEAP32[$vararg_buffer1>>2] = $34;
 (_printf(2483,$vararg_buffer1)|0);
 $35 = $3;
 _fus_parser_init($9,$35);
 (_printf(7866,$vararg_buffer3)|0);
 $36 = $7;
 $37 = (($36) + 1)|0;
 $7 = $37;
 $38 = ((($9)) + 4|0);
 $39 = ((($38)) + 8|0);
 $40 = HEAP32[$39>>2]|0;
 $10 = $40;
 $11 = 0;
 $41 = $10;
 $42 = $11;
 HEAP32[$vararg_buffer5>>2] = $41;
 $vararg_ptr8 = ((($vararg_buffer5)) + 4|0);
 HEAP32[$vararg_ptr8>>2] = $42;
 (_printf(3084,$vararg_buffer5)|0);
 $43 = $10;
 $44 = $11;
 $45 = ($43|0)==($44|0);
 if (!($45)) {
  (_printf(2565,$vararg_buffer9)|0);
  $46 = $8;
  $47 = (($46) + 1)|0;
  $8 = $47;
 }
 (_printf(7895,$vararg_buffer11)|0);
 $48 = $7;
 $49 = (($48) + 1)|0;
 $7 = $49;
 $50 = ((($9)) + 20|0);
 $51 = ((($50)) + 8|0);
 $52 = HEAP32[$51>>2]|0;
 $12 = $52;
 $13 = 0;
 $53 = $12;
 $54 = $13;
 HEAP32[$vararg_buffer13>>2] = $53;
 $vararg_ptr16 = ((($vararg_buffer13)) + 4|0);
 HEAP32[$vararg_ptr16>>2] = $54;
 (_printf(3084,$vararg_buffer13)|0);
 $55 = $12;
 $56 = $13;
 $57 = ($55|0)==($56|0);
 if (!($57)) {
  (_printf(2565,$vararg_buffer17)|0);
  $58 = $8;
  $59 = (($58) + 1)|0;
  $8 = $59;
 }
 (_fus_parser_stringparse_sym($9,4862)|0);
 (_fus_parser_stringparse_sym($9,4936)|0);
 (_printf(7866,$vararg_buffer19)|0);
 $60 = $7;
 $61 = (($60) + 1)|0;
 $7 = $61;
 $62 = ((($9)) + 4|0);
 $63 = ((($62)) + 8|0);
 $64 = HEAP32[$63>>2]|0;
 $14 = $64;
 $15 = 0;
 $65 = $14;
 $66 = $15;
 HEAP32[$vararg_buffer21>>2] = $65;
 $vararg_ptr24 = ((($vararg_buffer21)) + 4|0);
 HEAP32[$vararg_ptr24>>2] = $66;
 (_printf(3084,$vararg_buffer21)|0);
 $67 = $14;
 $68 = $15;
 $69 = ($67|0)==($68|0);
 if (!($69)) {
  (_printf(2565,$vararg_buffer25)|0);
  $70 = $8;
  $71 = (($70) + 1)|0;
  $8 = $71;
 }
 (_printf(7925,$vararg_buffer27)|0);
 $72 = $7;
 $73 = (($72) + 1)|0;
 $7 = $73;
 $74 = ((($9)) + 20|0);
 $75 = ((($74)) + 8|0);
 $76 = HEAP32[$75>>2]|0;
 $16 = $76;
 $17 = 2;
 $77 = $16;
 $78 = $17;
 HEAP32[$vararg_buffer29>>2] = $77;
 $vararg_ptr32 = ((($vararg_buffer29)) + 4|0);
 HEAP32[$vararg_ptr32>>2] = $78;
 (_printf(3084,$vararg_buffer29)|0);
 $79 = $16;
 $80 = $17;
 $81 = ($79|0)==($80|0);
 if (!($81)) {
  (_printf(2565,$vararg_buffer33)|0);
  $82 = $8;
  $83 = (($82) + 1)|0;
  $8 = $83;
 }
 (_fus_parser_push_arr($9)|0);
 (_printf(7955,$vararg_buffer35)|0);
 $84 = $7;
 $85 = (($84) + 1)|0;
 $7 = $85;
 $86 = ((($9)) + 4|0);
 $87 = ((($86)) + 8|0);
 $88 = HEAP32[$87>>2]|0;
 $18 = $88;
 $19 = 1;
 $89 = $18;
 $90 = $19;
 HEAP32[$vararg_buffer37>>2] = $89;
 $vararg_ptr40 = ((($vararg_buffer37)) + 4|0);
 HEAP32[$vararg_ptr40>>2] = $90;
 (_printf(3084,$vararg_buffer37)|0);
 $91 = $18;
 $92 = $19;
 $93 = ($91|0)==($92|0);
 if (!($93)) {
  (_printf(2565,$vararg_buffer41)|0);
  $94 = $8;
  $95 = (($94) + 1)|0;
  $8 = $95;
 }
 (_printf(7895,$vararg_buffer43)|0);
 $96 = $7;
 $97 = (($96) + 1)|0;
 $7 = $97;
 $98 = ((($9)) + 20|0);
 $99 = ((($98)) + 8|0);
 $100 = HEAP32[$99>>2]|0;
 $20 = $100;
 $21 = 0;
 $101 = $20;
 $102 = $21;
 HEAP32[$vararg_buffer45>>2] = $101;
 $vararg_ptr48 = ((($vararg_buffer45)) + 4|0);
 HEAP32[$vararg_ptr48>>2] = $102;
 (_printf(3084,$vararg_buffer45)|0);
 $103 = $20;
 $104 = $21;
 $105 = ($103|0)==($104|0);
 if (!($105)) {
  (_printf(2565,$vararg_buffer49)|0);
  $106 = $8;
  $107 = (($106) + 1)|0;
  $8 = $107;
 }
 (_fus_parser_stringparse_sym($9,5047)|0);
 (_fus_parser_stringparse_str($9,5090)|0);
 (_fus_parser_stringparse_sym($9,5166)|0);
 (_fus_parser_stringparse_int($9,5198)|0);
 (_fus_parser_stringparse_sym($9,5166)|0);
 (_fus_parser_stringparse_str($9,5272)|0);
 (_fus_parser_stringparse_sym($9,5166)|0);
 (_fus_parser_push_arr($9)|0);
 (_fus_parser_stringparse_sym($9,5309)|0);
 (_fus_parser_stringparse_int($9,5343)|0);
 (_fus_parser_stringparse_sym($9,5376)|0);
 (_fus_parser_stringparse_sym($9,5409)|0);
 (_fus_parser_stringparse_int($9,5198)|0);
 (_fus_parser_stringparse_sym($9,5376)|0);
 (_fus_parser_stringparse_sym($9,5441)|0);
 (_printf(7984,$vararg_buffer51)|0);
 $108 = $7;
 $109 = (($108) + 1)|0;
 $7 = $109;
 $110 = ((($9)) + 4|0);
 $111 = ((($110)) + 8|0);
 $112 = HEAP32[$111>>2]|0;
 $22 = $112;
 $23 = 2;
 $113 = $22;
 $114 = $23;
 HEAP32[$vararg_buffer53>>2] = $113;
 $vararg_ptr56 = ((($vararg_buffer53)) + 4|0);
 HEAP32[$vararg_ptr56>>2] = $114;
 (_printf(3084,$vararg_buffer53)|0);
 $115 = $22;
 $116 = $23;
 $117 = ($115|0)==($116|0);
 if (!($117)) {
  (_printf(2565,$vararg_buffer57)|0);
  $118 = $8;
  $119 = (($118) + 1)|0;
  $8 = $119;
 }
 (_printf(8013,$vararg_buffer59)|0);
 $120 = $7;
 $121 = (($120) + 1)|0;
 $7 = $121;
 $122 = ((($9)) + 20|0);
 $123 = ((($122)) + 8|0);
 $124 = HEAP32[$123>>2]|0;
 $24 = $124;
 $25 = 7;
 $125 = $24;
 $126 = $25;
 HEAP32[$vararg_buffer61>>2] = $125;
 $vararg_ptr64 = ((($vararg_buffer61)) + 4|0);
 HEAP32[$vararg_ptr64>>2] = $126;
 (_printf(3084,$vararg_buffer61)|0);
 $127 = $24;
 $128 = $25;
 $129 = ($127|0)==($128|0);
 if (!($129)) {
  (_printf(2565,$vararg_buffer65)|0);
  $130 = $8;
  $131 = (($130) + 1)|0;
  $8 = $131;
 }
 (_fus_parser_pop_arr($9)|0);
 (_fus_parser_stringparse_sym($9,5166)|0);
 (_fus_parser_stringparse_str($9,5552)|0);
 (_fus_parser_stringparse_sym($9,5166)|0);
 (_fus_parser_stringparse_sym($9,5586)|0);
 (_fus_parser_stringparse_sym($9,5623)|0);
 (_fus_parser_stringparse_str($9,5685)|0);
 (_fus_parser_stringparse_sym($9,5745)|0);
 (_fus_parser_stringparse_sym($9,4789)|0);
 (_printf(7955,$vararg_buffer67)|0);
 $132 = $7;
 $133 = (($132) + 1)|0;
 $7 = $133;
 $134 = ((($9)) + 4|0);
 $135 = ((($134)) + 8|0);
 $136 = HEAP32[$135>>2]|0;
 $26 = $136;
 $27 = 1;
 $137 = $26;
 $138 = $27;
 HEAP32[$vararg_buffer69>>2] = $137;
 $vararg_ptr72 = ((($vararg_buffer69)) + 4|0);
 HEAP32[$vararg_ptr72>>2] = $138;
 (_printf(3084,$vararg_buffer69)|0);
 $139 = $26;
 $140 = $27;
 $141 = ($139|0)==($140|0);
 if (!($141)) {
  (_printf(2565,$vararg_buffer73)|0);
  $142 = $8;
  $143 = (($142) + 1)|0;
  $8 = $143;
 }
 (_printf(8043,$vararg_buffer75)|0);
 $144 = $7;
 $145 = (($144) + 1)|0;
 $7 = $145;
 $146 = ((($9)) + 20|0);
 $147 = ((($146)) + 8|0);
 $148 = HEAP32[$147>>2]|0;
 $28 = $148;
 $29 = 16;
 $149 = $28;
 $150 = $29;
 HEAP32[$vararg_buffer77>>2] = $149;
 $vararg_ptr80 = ((($vararg_buffer77)) + 4|0);
 HEAP32[$vararg_ptr80>>2] = $150;
 (_printf(3084,$vararg_buffer77)|0);
 $151 = $28;
 $152 = $29;
 $153 = ($151|0)==($152|0);
 if (!($153)) {
  (_printf(2565,$vararg_buffer81)|0);
  $154 = $8;
  $155 = (($154) + 1)|0;
  $8 = $155;
 }
 (_fus_parser_pop_arr($9)|0);
 (_printf(7866,$vararg_buffer83)|0);
 $156 = $7;
 $157 = (($156) + 1)|0;
 $7 = $157;
 $158 = ((($9)) + 4|0);
 $159 = ((($158)) + 8|0);
 $160 = HEAP32[$159>>2]|0;
 $30 = $160;
 $31 = 0;
 $161 = $30;
 $162 = $31;
 HEAP32[$vararg_buffer85>>2] = $161;
 $vararg_ptr88 = ((($vararg_buffer85)) + 4|0);
 HEAP32[$vararg_ptr88>>2] = $162;
 (_printf(3084,$vararg_buffer85)|0);
 $163 = $30;
 $164 = $31;
 $165 = ($163|0)==($164|0);
 if (!($165)) {
  (_printf(2565,$vararg_buffer89)|0);
  $166 = $8;
  $167 = (($166) + 1)|0;
  $8 = $167;
 }
 (_printf(8074,$vararg_buffer91)|0);
 $168 = $7;
 $169 = (($168) + 1)|0;
 $7 = $169;
 $170 = ((($9)) + 20|0);
 $171 = ((($170)) + 8|0);
 $172 = HEAP32[$171>>2]|0;
 $32 = $172;
 $33 = 3;
 $173 = $32;
 $174 = $33;
 HEAP32[$vararg_buffer93>>2] = $173;
 $vararg_ptr96 = ((($vararg_buffer93)) + 4|0);
 HEAP32[$vararg_ptr96>>2] = $174;
 (_printf(3084,$vararg_buffer93)|0);
 $175 = $32;
 $176 = $33;
 $177 = ($175|0)==($176|0);
 if ($177) {
  $180 = HEAP32[21]|0;
  _fus_parser_dump($9,$180);
  _fus_parser_cleanup($9);
  $181 = $6;
  HEAP32[$vararg_buffer99>>2] = $181;
  (_printf(3098,$vararg_buffer99)|0);
  $182 = $7;
  $183 = $8;
  $184 = (($182) - ($183))|0;
  $185 = $7;
  $186 = $8;
  $187 = ($186|0)==(0);
  $188 = $187 ? 3107 : 3110;
  HEAP32[$vararg_buffer102>>2] = $184;
  $vararg_ptr105 = ((($vararg_buffer102)) + 4|0);
  HEAP32[$vararg_ptr105>>2] = $185;
  $vararg_ptr106 = ((($vararg_buffer102)) + 8|0);
  HEAP32[$vararg_ptr106>>2] = $188;
  (_printf(3115,$vararg_buffer102)|0);
  (_printf(2401,$vararg_buffer107)|0);
  (_printf(3141,$vararg_buffer109)|0);
  $189 = $7;
  $190 = $4;
  $191 = HEAP32[$190>>2]|0;
  $192 = (($191) + ($189))|0;
  HEAP32[$190>>2] = $192;
  $193 = $8;
  $194 = $5;
  $195 = HEAP32[$194>>2]|0;
  $196 = (($195) + ($193))|0;
  HEAP32[$194>>2] = $196;
  STACKTOP = sp;return;
 }
 (_printf(2565,$vararg_buffer97)|0);
 $178 = $8;
 $179 = (($178) + 1)|0;
 $8 = $179;
 $180 = HEAP32[21]|0;
 _fus_parser_dump($9,$180);
 _fus_parser_cleanup($9);
 $181 = $6;
 HEAP32[$vararg_buffer99>>2] = $181;
 (_printf(3098,$vararg_buffer99)|0);
 $182 = $7;
 $183 = $8;
 $184 = (($182) - ($183))|0;
 $185 = $7;
 $186 = $8;
 $187 = ($186|0)==(0);
 $188 = $187 ? 3107 : 3110;
 HEAP32[$vararg_buffer102>>2] = $184;
 $vararg_ptr105 = ((($vararg_buffer102)) + 4|0);
 HEAP32[$vararg_ptr105>>2] = $185;
 $vararg_ptr106 = ((($vararg_buffer102)) + 8|0);
 HEAP32[$vararg_ptr106>>2] = $188;
 (_printf(3115,$vararg_buffer102)|0);
 (_printf(2401,$vararg_buffer107)|0);
 (_printf(3141,$vararg_buffer109)|0);
 $189 = $7;
 $190 = $4;
 $191 = HEAP32[$190>>2]|0;
 $192 = (($191) + ($189))|0;
 HEAP32[$190>>2] = $192;
 $193 = $8;
 $194 = $5;
 $195 = HEAP32[$194>>2]|0;
 $196 = (($195) + ($193))|0;
 HEAP32[$194>>2] = $196;
 STACKTOP = sp;return;
}
function _run_parser_lexer_tests($0,$1,$2) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 var $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0, $29 = 0;
 var $3 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, $vararg_buffer = 0, $vararg_buffer1 = 0, $vararg_buffer10 = 0;
 var $vararg_buffer15 = 0, $vararg_buffer17 = 0, $vararg_buffer3 = 0, $vararg_buffer5 = 0, $vararg_buffer7 = 0, $vararg_ptr13 = 0, $vararg_ptr14 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 448|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(448|0);
 $vararg_buffer17 = sp + 64|0;
 $vararg_buffer15 = sp + 56|0;
 $vararg_buffer10 = sp + 40|0;
 $vararg_buffer7 = sp + 32|0;
 $vararg_buffer5 = sp + 24|0;
 $vararg_buffer3 = sp + 16|0;
 $vararg_buffer1 = sp + 8|0;
 $vararg_buffer = sp;
 $10 = sp + 104|0;
 $11 = sp + 68|0;
 $3 = $0;
 $4 = $1;
 $5 = $2;
 $6 = 8104;
 $7 = 0;
 $8 = 0;
 (_printf(2401,$vararg_buffer)|0);
 $12 = $6;
 HEAP32[$vararg_buffer1>>2] = $12;
 (_printf(2483,$vararg_buffer1)|0);
 $9 = 4311;
 _fus_lexer_init($10,0);
 $13 = $9;
 $14 = $9;
 $15 = (_strlen($14)|0);
 $16 = (($15) + 1)|0;
 _fus_lexer_load_chunk($10,$13,$16);
 $17 = $3;
 _fus_parser_init($11,$17);
 (_fus_parser_parse_lexer($11,$10)|0);
 (_printf(4423,$vararg_buffer3)|0);
 $18 = $7;
 $19 = (($18) + 1)|0;
 $7 = $19;
 $20 = (_fus_lexer_is_done($10)|0);
 if (!($20)) {
  (_printf(2565,$vararg_buffer5)|0);
  $21 = $8;
  $22 = (($21) + 1)|0;
  $8 = $22;
 }
 $23 = HEAP32[21]|0;
 _fus_parser_dump($11,$23);
 _fus_parser_cleanup($11);
 _fus_lexer_cleanup($10);
 $24 = $6;
 HEAP32[$vararg_buffer7>>2] = $24;
 (_printf(3098,$vararg_buffer7)|0);
 $25 = $7;
 $26 = $8;
 $27 = (($25) - ($26))|0;
 $28 = $7;
 $29 = $8;
 $30 = ($29|0)==(0);
 $31 = $30 ? 3107 : 3110;
 HEAP32[$vararg_buffer10>>2] = $27;
 $vararg_ptr13 = ((($vararg_buffer10)) + 4|0);
 HEAP32[$vararg_ptr13>>2] = $28;
 $vararg_ptr14 = ((($vararg_buffer10)) + 8|0);
 HEAP32[$vararg_ptr14>>2] = $31;
 (_printf(3115,$vararg_buffer10)|0);
 (_printf(2401,$vararg_buffer15)|0);
 (_printf(3141,$vararg_buffer17)|0);
 $32 = $7;
 $33 = $4;
 $34 = HEAP32[$33>>2]|0;
 $35 = (($34) + ($32))|0;
 HEAP32[$33>>2] = $35;
 $36 = $8;
 $37 = $5;
 $38 = HEAP32[$37>>2]|0;
 $39 = (($38) + ($36))|0;
 HEAP32[$37>>2] = $39;
 STACKTOP = sp;return;
}
function _run_tests($0) {
 $0 = $0|0;
 var $1 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0;
 var $28 = 0, $29 = 0, $3 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, $vararg_buffer = 0, $vararg_buffer1 = 0;
 var $vararg_buffer4 = 0, $vararg_buffer6 = 0, $vararg_buffer8 = 0, $vararg_ptr11 = 0, $vararg_ptr12 = 0, $vararg_ptr3 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 64|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(64|0);
 $vararg_buffer8 = sp + 32|0;
 $vararg_buffer6 = sp + 24|0;
 $vararg_buffer4 = sp + 16|0;
 $vararg_buffer1 = sp + 8|0;
 $vararg_buffer = sp;
 $2 = sp + 56|0;
 $3 = sp + 52|0;
 $1 = $0;
 HEAP32[$2>>2] = 0;
 HEAP32[$3>>2] = 0;
 $6 = $1;
 _run_unboxed_tests($6,$2,$3);
 $7 = $1;
 _run_arr_tests_basic($7,$2,$3);
 $8 = $1;
 _run_arr_tests_medium($8,$2,$3);
 $9 = $1;
 _run_arr_tests_uhhh($9,$2,$3);
 $10 = $1;
 _run_str_tests_basic($10,$2,$3);
 $11 = $1;
 $12 = HEAP32[$11>>2]|0;
 _run_symtable_tests_basic($12,$2,$3);
 $13 = $1;
 _run_symtable_tests_full($13,$2,$3);
 $14 = $1;
 _run_obj_tests_basic($14,$2,$3);
 $15 = $1;
 _run_lexer_tests($15,$2,$3);
 $16 = $1;
 _run_parser_tests_basic($16,$2,$3);
 $17 = $1;
 _run_parser_tests_full($17,$2,$3);
 $18 = $1;
 _run_parser_lexer_tests($18,$2,$3);
 (_printf(3064,$vararg_buffer)|0);
 $19 = HEAP32[$2>>2]|0;
 $20 = (($19) + 1)|0;
 HEAP32[$2>>2] = $20;
 $21 = $1;
 $22 = ((($21)) + 8|0);
 $23 = HEAP32[$22>>2]|0;
 $4 = $23;
 $5 = 0;
 $24 = $4;
 $25 = $5;
 HEAP32[$vararg_buffer1>>2] = $24;
 $vararg_ptr3 = ((($vararg_buffer1)) + 4|0);
 HEAP32[$vararg_ptr3>>2] = $25;
 (_printf(3084,$vararg_buffer1)|0);
 $26 = $4;
 $27 = $5;
 $28 = ($26|0)==($27|0);
 if (!($28)) {
  (_printf(2565,$vararg_buffer4)|0);
  $29 = HEAP32[$3>>2]|0;
  $30 = (($29) + 1)|0;
  HEAP32[$3>>2] = $30;
 }
 (_printf(8130,$vararg_buffer6)|0);
 $31 = HEAP32[$2>>2]|0;
 $32 = HEAP32[$3>>2]|0;
 $33 = (($31) - ($32))|0;
 $34 = HEAP32[$2>>2]|0;
 $35 = HEAP32[$3>>2]|0;
 $36 = ($35|0)==(0);
 $37 = $36 ? 3107 : 3110;
 HEAP32[$vararg_buffer8>>2] = $33;
 $vararg_ptr11 = ((($vararg_buffer8)) + 4|0);
 HEAP32[$vararg_ptr11>>2] = $34;
 $vararg_ptr12 = ((($vararg_buffer8)) + 8|0);
 HEAP32[$vararg_ptr12>>2] = $37;
 (_printf(3115,$vararg_buffer8)|0);
 $38 = HEAP32[$3>>2]|0;
 STACKTOP = sp;return ($38|0);
}
function _main($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 4912|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(4912|0);
 $5 = sp;
 $2 = 0;
 $3 = $0;
 $4 = $1;
 _fus_init($5);
 $6 = ((($5)) + 364|0);
 $7 = (_run_tests($6)|0);
 $8 = ($7|0)!=(0);
 if ($8) {
  $2 = 1;
 } else {
  _fus_cleanup($5);
  $2 = 0;
 }
 $9 = $2;
 STACKTOP = sp;return ($9|0);
}
function _malloc($0) {
 $0 = $0|0;
 var $$$0172$i = 0, $$$0173$i = 0, $$$4236$i = 0, $$$4329$i = 0, $$$i = 0, $$0 = 0, $$0$i = 0, $$0$i$i = 0, $$0$i$i$i = 0, $$0$i20$i = 0, $$0172$lcssa$i = 0, $$01724$i = 0, $$0173$lcssa$i = 0, $$01733$i = 0, $$0192 = 0, $$0194 = 0, $$0201$i$i = 0, $$0202$i$i = 0, $$0206$i$i = 0, $$0207$i$i = 0;
 var $$024367$i = 0, $$0260$i$i = 0, $$0261$i$i = 0, $$0262$i$i = 0, $$0268$i$i = 0, $$0269$i$i = 0, $$0320$i = 0, $$0322$i = 0, $$0323$i = 0, $$0325$i = 0, $$0331$i = 0, $$0336$i = 0, $$0337$$i = 0, $$0337$i = 0, $$0339$i = 0, $$0340$i = 0, $$0345$i = 0, $$1176$i = 0, $$1178$i = 0, $$124466$i = 0;
 var $$1264$i$i = 0, $$1266$i$i = 0, $$1321$i = 0, $$1326$i = 0, $$1341$i = 0, $$1347$i = 0, $$1351$i = 0, $$2234243136$i = 0, $$2247$ph$i = 0, $$2253$ph$i = 0, $$2333$i = 0, $$3$i = 0, $$3$i$i = 0, $$3$i199 = 0, $$3328$i = 0, $$3349$i = 0, $$4$lcssa$i = 0, $$4$ph$i = 0, $$4236$i = 0, $$4329$lcssa$i = 0;
 var $$43298$i = 0, $$4335$$4$i = 0, $$4335$ph$i = 0, $$43357$i = 0, $$49$i = 0, $$723947$i = 0, $$748$i = 0, $$pre = 0, $$pre$i = 0, $$pre$i$i = 0, $$pre$i17$i = 0, $$pre$i195 = 0, $$pre$i207 = 0, $$pre$phi$i$iZ2D = 0, $$pre$phi$i18$iZ2D = 0, $$pre$phi$i208Z2D = 0, $$pre$phi$iZ2D = 0, $$pre$phiZ2D = 0, $$sink1$i = 0, $$sink1$i$i = 0;
 var $$sink12$i = 0, $$sink2$i = 0, $$sink2$i202 = 0, $$sink3$i = 0, $1 = 0, $10 = 0, $100 = 0, $101 = 0, $102 = 0, $103 = 0, $104 = 0, $105 = 0, $106 = 0, $107 = 0, $108 = 0, $109 = 0, $11 = 0, $110 = 0, $111 = 0, $112 = 0;
 var $113 = 0, $114 = 0, $115 = 0, $116 = 0, $117 = 0, $118 = 0, $119 = 0, $12 = 0, $120 = 0, $121 = 0, $122 = 0, $123 = 0, $124 = 0, $125 = 0, $126 = 0, $127 = 0, $128 = 0, $129 = 0, $13 = 0, $130 = 0;
 var $131 = 0, $132 = 0, $133 = 0, $134 = 0, $135 = 0, $136 = 0, $137 = 0, $138 = 0, $139 = 0, $14 = 0, $140 = 0, $141 = 0, $142 = 0, $143 = 0, $144 = 0, $145 = 0, $146 = 0, $147 = 0, $148 = 0, $149 = 0;
 var $15 = 0, $150 = 0, $151 = 0, $152 = 0, $153 = 0, $154 = 0, $155 = 0, $156 = 0, $157 = 0, $158 = 0, $159 = 0, $16 = 0, $160 = 0, $161 = 0, $162 = 0, $163 = 0, $164 = 0, $165 = 0, $166 = 0, $167 = 0;
 var $168 = 0, $169 = 0, $17 = 0, $170 = 0, $171 = 0, $172 = 0, $173 = 0, $174 = 0, $175 = 0, $176 = 0, $177 = 0, $178 = 0, $179 = 0, $18 = 0, $180 = 0, $181 = 0, $182 = 0, $183 = 0, $184 = 0, $185 = 0;
 var $186 = 0, $187 = 0, $188 = 0, $189 = 0, $19 = 0, $190 = 0, $191 = 0, $192 = 0, $193 = 0, $194 = 0, $195 = 0, $196 = 0, $197 = 0, $198 = 0, $199 = 0, $2 = 0, $20 = 0, $200 = 0, $201 = 0, $202 = 0;
 var $203 = 0, $204 = 0, $205 = 0, $206 = 0, $207 = 0, $208 = 0, $209 = 0, $21 = 0, $210 = 0, $211 = 0, $212 = 0, $213 = 0, $214 = 0, $215 = 0, $216 = 0, $217 = 0, $218 = 0, $219 = 0, $22 = 0, $220 = 0;
 var $221 = 0, $222 = 0, $223 = 0, $224 = 0, $225 = 0, $226 = 0, $227 = 0, $228 = 0, $229 = 0, $23 = 0, $230 = 0, $231 = 0, $232 = 0, $233 = 0, $234 = 0, $235 = 0, $236 = 0, $237 = 0, $238 = 0, $239 = 0;
 var $24 = 0, $240 = 0, $241 = 0, $242 = 0, $243 = 0, $244 = 0, $245 = 0, $246 = 0, $247 = 0, $248 = 0, $249 = 0, $25 = 0, $250 = 0, $251 = 0, $252 = 0, $253 = 0, $254 = 0, $255 = 0, $256 = 0, $257 = 0;
 var $258 = 0, $259 = 0, $26 = 0, $260 = 0, $261 = 0, $262 = 0, $263 = 0, $264 = 0, $265 = 0, $266 = 0, $267 = 0, $268 = 0, $269 = 0, $27 = 0, $270 = 0, $271 = 0, $272 = 0, $273 = 0, $274 = 0, $275 = 0;
 var $276 = 0, $277 = 0, $278 = 0, $279 = 0, $28 = 0, $280 = 0, $281 = 0, $282 = 0, $283 = 0, $284 = 0, $285 = 0, $286 = 0, $287 = 0, $288 = 0, $289 = 0, $29 = 0, $290 = 0, $291 = 0, $292 = 0, $293 = 0;
 var $294 = 0, $295 = 0, $296 = 0, $297 = 0, $298 = 0, $299 = 0, $3 = 0, $30 = 0, $300 = 0, $301 = 0, $302 = 0, $303 = 0, $304 = 0, $305 = 0, $306 = 0, $307 = 0, $308 = 0, $309 = 0, $31 = 0, $310 = 0;
 var $311 = 0, $312 = 0, $313 = 0, $314 = 0, $315 = 0, $316 = 0, $317 = 0, $318 = 0, $319 = 0, $32 = 0, $320 = 0, $321 = 0, $322 = 0, $323 = 0, $324 = 0, $325 = 0, $326 = 0, $327 = 0, $328 = 0, $329 = 0;
 var $33 = 0, $330 = 0, $331 = 0, $332 = 0, $333 = 0, $334 = 0, $335 = 0, $336 = 0, $337 = 0, $338 = 0, $339 = 0, $34 = 0, $340 = 0, $341 = 0, $342 = 0, $343 = 0, $344 = 0, $345 = 0, $346 = 0, $347 = 0;
 var $348 = 0, $349 = 0, $35 = 0, $350 = 0, $351 = 0, $352 = 0, $353 = 0, $354 = 0, $355 = 0, $356 = 0, $357 = 0, $358 = 0, $359 = 0, $36 = 0, $360 = 0, $361 = 0, $362 = 0, $363 = 0, $364 = 0, $365 = 0;
 var $366 = 0, $367 = 0, $368 = 0, $369 = 0, $37 = 0, $370 = 0, $371 = 0, $372 = 0, $373 = 0, $374 = 0, $375 = 0, $376 = 0, $377 = 0, $378 = 0, $379 = 0, $38 = 0, $380 = 0, $381 = 0, $382 = 0, $383 = 0;
 var $384 = 0, $385 = 0, $386 = 0, $387 = 0, $388 = 0, $389 = 0, $39 = 0, $390 = 0, $391 = 0, $392 = 0, $393 = 0, $394 = 0, $395 = 0, $396 = 0, $397 = 0, $398 = 0, $399 = 0, $4 = 0, $40 = 0, $400 = 0;
 var $401 = 0, $402 = 0, $403 = 0, $404 = 0, $405 = 0, $406 = 0, $407 = 0, $408 = 0, $409 = 0, $41 = 0, $410 = 0, $411 = 0, $412 = 0, $413 = 0, $414 = 0, $415 = 0, $416 = 0, $417 = 0, $418 = 0, $419 = 0;
 var $42 = 0, $420 = 0, $421 = 0, $422 = 0, $423 = 0, $424 = 0, $425 = 0, $426 = 0, $427 = 0, $428 = 0, $429 = 0, $43 = 0, $430 = 0, $431 = 0, $432 = 0, $433 = 0, $434 = 0, $435 = 0, $436 = 0, $437 = 0;
 var $438 = 0, $439 = 0, $44 = 0, $440 = 0, $441 = 0, $442 = 0, $443 = 0, $444 = 0, $445 = 0, $446 = 0, $447 = 0, $448 = 0, $449 = 0, $45 = 0, $450 = 0, $451 = 0, $452 = 0, $453 = 0, $454 = 0, $455 = 0;
 var $456 = 0, $457 = 0, $458 = 0, $459 = 0, $46 = 0, $460 = 0, $461 = 0, $462 = 0, $463 = 0, $464 = 0, $465 = 0, $466 = 0, $467 = 0, $468 = 0, $469 = 0, $47 = 0, $470 = 0, $471 = 0, $472 = 0, $473 = 0;
 var $474 = 0, $475 = 0, $476 = 0, $477 = 0, $478 = 0, $479 = 0, $48 = 0, $480 = 0, $481 = 0, $482 = 0, $483 = 0, $484 = 0, $485 = 0, $486 = 0, $487 = 0, $488 = 0, $489 = 0, $49 = 0, $490 = 0, $491 = 0;
 var $492 = 0, $493 = 0, $494 = 0, $495 = 0, $496 = 0, $497 = 0, $498 = 0, $499 = 0, $5 = 0, $50 = 0, $500 = 0, $501 = 0, $502 = 0, $503 = 0, $504 = 0, $505 = 0, $506 = 0, $507 = 0, $508 = 0, $509 = 0;
 var $51 = 0, $510 = 0, $511 = 0, $512 = 0, $513 = 0, $514 = 0, $515 = 0, $516 = 0, $517 = 0, $518 = 0, $519 = 0, $52 = 0, $520 = 0, $521 = 0, $522 = 0, $523 = 0, $524 = 0, $525 = 0, $526 = 0, $527 = 0;
 var $528 = 0, $529 = 0, $53 = 0, $530 = 0, $531 = 0, $532 = 0, $533 = 0, $534 = 0, $535 = 0, $536 = 0, $537 = 0, $538 = 0, $539 = 0, $54 = 0, $540 = 0, $541 = 0, $542 = 0, $543 = 0, $544 = 0, $545 = 0;
 var $546 = 0, $547 = 0, $548 = 0, $549 = 0, $55 = 0, $550 = 0, $551 = 0, $552 = 0, $553 = 0, $554 = 0, $555 = 0, $556 = 0, $557 = 0, $558 = 0, $559 = 0, $56 = 0, $560 = 0, $561 = 0, $562 = 0, $563 = 0;
 var $564 = 0, $565 = 0, $566 = 0, $567 = 0, $568 = 0, $569 = 0, $57 = 0, $570 = 0, $571 = 0, $572 = 0, $573 = 0, $574 = 0, $575 = 0, $576 = 0, $577 = 0, $578 = 0, $579 = 0, $58 = 0, $580 = 0, $581 = 0;
 var $582 = 0, $583 = 0, $584 = 0, $585 = 0, $586 = 0, $587 = 0, $588 = 0, $589 = 0, $59 = 0, $590 = 0, $591 = 0, $592 = 0, $593 = 0, $594 = 0, $595 = 0, $596 = 0, $597 = 0, $598 = 0, $599 = 0, $6 = 0;
 var $60 = 0, $600 = 0, $601 = 0, $602 = 0, $603 = 0, $604 = 0, $605 = 0, $606 = 0, $607 = 0, $608 = 0, $609 = 0, $61 = 0, $610 = 0, $611 = 0, $612 = 0, $613 = 0, $614 = 0, $615 = 0, $616 = 0, $617 = 0;
 var $618 = 0, $619 = 0, $62 = 0, $620 = 0, $621 = 0, $622 = 0, $623 = 0, $624 = 0, $625 = 0, $626 = 0, $627 = 0, $628 = 0, $629 = 0, $63 = 0, $630 = 0, $631 = 0, $632 = 0, $633 = 0, $634 = 0, $635 = 0;
 var $636 = 0, $637 = 0, $638 = 0, $639 = 0, $64 = 0, $640 = 0, $641 = 0, $642 = 0, $643 = 0, $644 = 0, $645 = 0, $646 = 0, $647 = 0, $648 = 0, $649 = 0, $65 = 0, $650 = 0, $651 = 0, $652 = 0, $653 = 0;
 var $654 = 0, $655 = 0, $656 = 0, $657 = 0, $658 = 0, $659 = 0, $66 = 0, $660 = 0, $661 = 0, $662 = 0, $663 = 0, $664 = 0, $665 = 0, $666 = 0, $667 = 0, $668 = 0, $669 = 0, $67 = 0, $670 = 0, $671 = 0;
 var $672 = 0, $673 = 0, $674 = 0, $675 = 0, $676 = 0, $677 = 0, $678 = 0, $679 = 0, $68 = 0, $680 = 0, $681 = 0, $682 = 0, $683 = 0, $684 = 0, $685 = 0, $686 = 0, $687 = 0, $688 = 0, $689 = 0, $69 = 0;
 var $690 = 0, $691 = 0, $692 = 0, $693 = 0, $694 = 0, $695 = 0, $696 = 0, $697 = 0, $698 = 0, $699 = 0, $7 = 0, $70 = 0, $700 = 0, $701 = 0, $702 = 0, $703 = 0, $704 = 0, $705 = 0, $706 = 0, $707 = 0;
 var $708 = 0, $709 = 0, $71 = 0, $710 = 0, $711 = 0, $712 = 0, $713 = 0, $714 = 0, $715 = 0, $716 = 0, $717 = 0, $718 = 0, $719 = 0, $72 = 0, $720 = 0, $721 = 0, $722 = 0, $723 = 0, $724 = 0, $725 = 0;
 var $726 = 0, $727 = 0, $728 = 0, $729 = 0, $73 = 0, $730 = 0, $731 = 0, $732 = 0, $733 = 0, $734 = 0, $735 = 0, $736 = 0, $737 = 0, $738 = 0, $739 = 0, $74 = 0, $740 = 0, $741 = 0, $742 = 0, $743 = 0;
 var $744 = 0, $745 = 0, $746 = 0, $747 = 0, $748 = 0, $749 = 0, $75 = 0, $750 = 0, $751 = 0, $752 = 0, $753 = 0, $754 = 0, $755 = 0, $756 = 0, $757 = 0, $758 = 0, $759 = 0, $76 = 0, $760 = 0, $761 = 0;
 var $762 = 0, $763 = 0, $764 = 0, $765 = 0, $766 = 0, $767 = 0, $768 = 0, $769 = 0, $77 = 0, $770 = 0, $771 = 0, $772 = 0, $773 = 0, $774 = 0, $775 = 0, $776 = 0, $777 = 0, $778 = 0, $779 = 0, $78 = 0;
 var $780 = 0, $781 = 0, $782 = 0, $783 = 0, $784 = 0, $785 = 0, $786 = 0, $787 = 0, $788 = 0, $789 = 0, $79 = 0, $790 = 0, $791 = 0, $792 = 0, $793 = 0, $794 = 0, $795 = 0, $796 = 0, $797 = 0, $798 = 0;
 var $799 = 0, $8 = 0, $80 = 0, $800 = 0, $801 = 0, $802 = 0, $803 = 0, $804 = 0, $805 = 0, $806 = 0, $807 = 0, $808 = 0, $809 = 0, $81 = 0, $810 = 0, $811 = 0, $812 = 0, $813 = 0, $814 = 0, $815 = 0;
 var $816 = 0, $817 = 0, $818 = 0, $819 = 0, $82 = 0, $820 = 0, $821 = 0, $822 = 0, $823 = 0, $824 = 0, $825 = 0, $826 = 0, $827 = 0, $828 = 0, $829 = 0, $83 = 0, $830 = 0, $831 = 0, $832 = 0, $833 = 0;
 var $834 = 0, $835 = 0, $836 = 0, $837 = 0, $838 = 0, $839 = 0, $84 = 0, $840 = 0, $841 = 0, $842 = 0, $843 = 0, $844 = 0, $845 = 0, $846 = 0, $847 = 0, $848 = 0, $849 = 0, $85 = 0, $850 = 0, $851 = 0;
 var $852 = 0, $853 = 0, $854 = 0, $855 = 0, $856 = 0, $857 = 0, $858 = 0, $859 = 0, $86 = 0, $860 = 0, $861 = 0, $862 = 0, $863 = 0, $864 = 0, $865 = 0, $866 = 0, $867 = 0, $868 = 0, $869 = 0, $87 = 0;
 var $870 = 0, $871 = 0, $872 = 0, $873 = 0, $874 = 0, $875 = 0, $876 = 0, $877 = 0, $878 = 0, $879 = 0, $88 = 0, $880 = 0, $881 = 0, $882 = 0, $883 = 0, $884 = 0, $885 = 0, $886 = 0, $887 = 0, $888 = 0;
 var $889 = 0, $89 = 0, $890 = 0, $891 = 0, $892 = 0, $893 = 0, $894 = 0, $895 = 0, $896 = 0, $897 = 0, $898 = 0, $899 = 0, $9 = 0, $90 = 0, $900 = 0, $901 = 0, $902 = 0, $903 = 0, $904 = 0, $905 = 0;
 var $906 = 0, $907 = 0, $908 = 0, $909 = 0, $91 = 0, $910 = 0, $911 = 0, $912 = 0, $913 = 0, $914 = 0, $915 = 0, $916 = 0, $917 = 0, $918 = 0, $919 = 0, $92 = 0, $920 = 0, $921 = 0, $922 = 0, $923 = 0;
 var $924 = 0, $925 = 0, $926 = 0, $927 = 0, $928 = 0, $929 = 0, $93 = 0, $930 = 0, $931 = 0, $932 = 0, $933 = 0, $934 = 0, $935 = 0, $936 = 0, $937 = 0, $938 = 0, $939 = 0, $94 = 0, $940 = 0, $941 = 0;
 var $942 = 0, $943 = 0, $944 = 0, $945 = 0, $946 = 0, $947 = 0, $948 = 0, $949 = 0, $95 = 0, $950 = 0, $951 = 0, $952 = 0, $953 = 0, $954 = 0, $955 = 0, $956 = 0, $957 = 0, $958 = 0, $959 = 0, $96 = 0;
 var $960 = 0, $961 = 0, $962 = 0, $963 = 0, $964 = 0, $965 = 0, $966 = 0, $967 = 0, $968 = 0, $969 = 0, $97 = 0, $970 = 0, $971 = 0, $98 = 0, $99 = 0, $cond$i = 0, $cond$i$i = 0, $cond$i206 = 0, $not$$i = 0, $not$3$i = 0;
 var $or$cond$i = 0, $or$cond$i200 = 0, $or$cond1$i = 0, $or$cond1$i198 = 0, $or$cond10$i = 0, $or$cond11$i = 0, $or$cond11$not$i = 0, $or$cond12$i = 0, $or$cond2$i = 0, $or$cond49$i = 0, $or$cond5$i = 0, $or$cond50$i = 0, $or$cond7$i = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $1 = sp;
 $2 = ($0>>>0)<(245);
 do {
  if ($2) {
   $3 = ($0>>>0)<(11);
   $4 = (($0) + 11)|0;
   $5 = $4 & -8;
   $6 = $3 ? 16 : $5;
   $7 = $6 >>> 3;
   $8 = HEAP32[2642]|0;
   $9 = $8 >>> $7;
   $10 = $9 & 3;
   $11 = ($10|0)==(0);
   if (!($11)) {
    $12 = $9 & 1;
    $13 = $12 ^ 1;
    $14 = (($13) + ($7))|0;
    $15 = $14 << 1;
    $16 = (10608 + ($15<<2)|0);
    $17 = ((($16)) + 8|0);
    $18 = HEAP32[$17>>2]|0;
    $19 = ((($18)) + 8|0);
    $20 = HEAP32[$19>>2]|0;
    $21 = ($20|0)==($16|0);
    if ($21) {
     $22 = 1 << $14;
     $23 = $22 ^ -1;
     $24 = $8 & $23;
     HEAP32[2642] = $24;
    } else {
     $25 = ((($20)) + 12|0);
     HEAP32[$25>>2] = $16;
     HEAP32[$17>>2] = $20;
    }
    $26 = $14 << 3;
    $27 = $26 | 3;
    $28 = ((($18)) + 4|0);
    HEAP32[$28>>2] = $27;
    $29 = (($18) + ($26)|0);
    $30 = ((($29)) + 4|0);
    $31 = HEAP32[$30>>2]|0;
    $32 = $31 | 1;
    HEAP32[$30>>2] = $32;
    $$0 = $19;
    STACKTOP = sp;return ($$0|0);
   }
   $33 = HEAP32[(10576)>>2]|0;
   $34 = ($6>>>0)>($33>>>0);
   if ($34) {
    $35 = ($9|0)==(0);
    if (!($35)) {
     $36 = $9 << $7;
     $37 = 2 << $7;
     $38 = (0 - ($37))|0;
     $39 = $37 | $38;
     $40 = $36 & $39;
     $41 = (0 - ($40))|0;
     $42 = $40 & $41;
     $43 = (($42) + -1)|0;
     $44 = $43 >>> 12;
     $45 = $44 & 16;
     $46 = $43 >>> $45;
     $47 = $46 >>> 5;
     $48 = $47 & 8;
     $49 = $48 | $45;
     $50 = $46 >>> $48;
     $51 = $50 >>> 2;
     $52 = $51 & 4;
     $53 = $49 | $52;
     $54 = $50 >>> $52;
     $55 = $54 >>> 1;
     $56 = $55 & 2;
     $57 = $53 | $56;
     $58 = $54 >>> $56;
     $59 = $58 >>> 1;
     $60 = $59 & 1;
     $61 = $57 | $60;
     $62 = $58 >>> $60;
     $63 = (($61) + ($62))|0;
     $64 = $63 << 1;
     $65 = (10608 + ($64<<2)|0);
     $66 = ((($65)) + 8|0);
     $67 = HEAP32[$66>>2]|0;
     $68 = ((($67)) + 8|0);
     $69 = HEAP32[$68>>2]|0;
     $70 = ($69|0)==($65|0);
     if ($70) {
      $71 = 1 << $63;
      $72 = $71 ^ -1;
      $73 = $8 & $72;
      HEAP32[2642] = $73;
      $90 = $73;
     } else {
      $74 = ((($69)) + 12|0);
      HEAP32[$74>>2] = $65;
      HEAP32[$66>>2] = $69;
      $90 = $8;
     }
     $75 = $63 << 3;
     $76 = (($75) - ($6))|0;
     $77 = $6 | 3;
     $78 = ((($67)) + 4|0);
     HEAP32[$78>>2] = $77;
     $79 = (($67) + ($6)|0);
     $80 = $76 | 1;
     $81 = ((($79)) + 4|0);
     HEAP32[$81>>2] = $80;
     $82 = (($67) + ($75)|0);
     HEAP32[$82>>2] = $76;
     $83 = ($33|0)==(0);
     if (!($83)) {
      $84 = HEAP32[(10588)>>2]|0;
      $85 = $33 >>> 3;
      $86 = $85 << 1;
      $87 = (10608 + ($86<<2)|0);
      $88 = 1 << $85;
      $89 = $90 & $88;
      $91 = ($89|0)==(0);
      if ($91) {
       $92 = $90 | $88;
       HEAP32[2642] = $92;
       $$pre = ((($87)) + 8|0);
       $$0194 = $87;$$pre$phiZ2D = $$pre;
      } else {
       $93 = ((($87)) + 8|0);
       $94 = HEAP32[$93>>2]|0;
       $$0194 = $94;$$pre$phiZ2D = $93;
      }
      HEAP32[$$pre$phiZ2D>>2] = $84;
      $95 = ((($$0194)) + 12|0);
      HEAP32[$95>>2] = $84;
      $96 = ((($84)) + 8|0);
      HEAP32[$96>>2] = $$0194;
      $97 = ((($84)) + 12|0);
      HEAP32[$97>>2] = $87;
     }
     HEAP32[(10576)>>2] = $76;
     HEAP32[(10588)>>2] = $79;
     $$0 = $68;
     STACKTOP = sp;return ($$0|0);
    }
    $98 = HEAP32[(10572)>>2]|0;
    $99 = ($98|0)==(0);
    if ($99) {
     $$0192 = $6;
    } else {
     $100 = (0 - ($98))|0;
     $101 = $98 & $100;
     $102 = (($101) + -1)|0;
     $103 = $102 >>> 12;
     $104 = $103 & 16;
     $105 = $102 >>> $104;
     $106 = $105 >>> 5;
     $107 = $106 & 8;
     $108 = $107 | $104;
     $109 = $105 >>> $107;
     $110 = $109 >>> 2;
     $111 = $110 & 4;
     $112 = $108 | $111;
     $113 = $109 >>> $111;
     $114 = $113 >>> 1;
     $115 = $114 & 2;
     $116 = $112 | $115;
     $117 = $113 >>> $115;
     $118 = $117 >>> 1;
     $119 = $118 & 1;
     $120 = $116 | $119;
     $121 = $117 >>> $119;
     $122 = (($120) + ($121))|0;
     $123 = (10872 + ($122<<2)|0);
     $124 = HEAP32[$123>>2]|0;
     $125 = ((($124)) + 4|0);
     $126 = HEAP32[$125>>2]|0;
     $127 = $126 & -8;
     $128 = (($127) - ($6))|0;
     $129 = ((($124)) + 16|0);
     $130 = HEAP32[$129>>2]|0;
     $131 = ($130|0)==(0|0);
     $$sink12$i = $131&1;
     $132 = (((($124)) + 16|0) + ($$sink12$i<<2)|0);
     $133 = HEAP32[$132>>2]|0;
     $134 = ($133|0)==(0|0);
     if ($134) {
      $$0172$lcssa$i = $124;$$0173$lcssa$i = $128;
     } else {
      $$01724$i = $124;$$01733$i = $128;$136 = $133;
      while(1) {
       $135 = ((($136)) + 4|0);
       $137 = HEAP32[$135>>2]|0;
       $138 = $137 & -8;
       $139 = (($138) - ($6))|0;
       $140 = ($139>>>0)<($$01733$i>>>0);
       $$$0173$i = $140 ? $139 : $$01733$i;
       $$$0172$i = $140 ? $136 : $$01724$i;
       $141 = ((($136)) + 16|0);
       $142 = HEAP32[$141>>2]|0;
       $143 = ($142|0)==(0|0);
       $$sink1$i = $143&1;
       $144 = (((($136)) + 16|0) + ($$sink1$i<<2)|0);
       $145 = HEAP32[$144>>2]|0;
       $146 = ($145|0)==(0|0);
       if ($146) {
        $$0172$lcssa$i = $$$0172$i;$$0173$lcssa$i = $$$0173$i;
        break;
       } else {
        $$01724$i = $$$0172$i;$$01733$i = $$$0173$i;$136 = $145;
       }
      }
     }
     $147 = (($$0172$lcssa$i) + ($6)|0);
     $148 = ($147>>>0)>($$0172$lcssa$i>>>0);
     if ($148) {
      $149 = ((($$0172$lcssa$i)) + 24|0);
      $150 = HEAP32[$149>>2]|0;
      $151 = ((($$0172$lcssa$i)) + 12|0);
      $152 = HEAP32[$151>>2]|0;
      $153 = ($152|0)==($$0172$lcssa$i|0);
      do {
       if ($153) {
        $158 = ((($$0172$lcssa$i)) + 20|0);
        $159 = HEAP32[$158>>2]|0;
        $160 = ($159|0)==(0|0);
        if ($160) {
         $161 = ((($$0172$lcssa$i)) + 16|0);
         $162 = HEAP32[$161>>2]|0;
         $163 = ($162|0)==(0|0);
         if ($163) {
          $$3$i = 0;
          break;
         } else {
          $$1176$i = $162;$$1178$i = $161;
         }
        } else {
         $$1176$i = $159;$$1178$i = $158;
        }
        while(1) {
         $164 = ((($$1176$i)) + 20|0);
         $165 = HEAP32[$164>>2]|0;
         $166 = ($165|0)==(0|0);
         if (!($166)) {
          $$1176$i = $165;$$1178$i = $164;
          continue;
         }
         $167 = ((($$1176$i)) + 16|0);
         $168 = HEAP32[$167>>2]|0;
         $169 = ($168|0)==(0|0);
         if ($169) {
          break;
         } else {
          $$1176$i = $168;$$1178$i = $167;
         }
        }
        HEAP32[$$1178$i>>2] = 0;
        $$3$i = $$1176$i;
       } else {
        $154 = ((($$0172$lcssa$i)) + 8|0);
        $155 = HEAP32[$154>>2]|0;
        $156 = ((($155)) + 12|0);
        HEAP32[$156>>2] = $152;
        $157 = ((($152)) + 8|0);
        HEAP32[$157>>2] = $155;
        $$3$i = $152;
       }
      } while(0);
      $170 = ($150|0)==(0|0);
      do {
       if (!($170)) {
        $171 = ((($$0172$lcssa$i)) + 28|0);
        $172 = HEAP32[$171>>2]|0;
        $173 = (10872 + ($172<<2)|0);
        $174 = HEAP32[$173>>2]|0;
        $175 = ($$0172$lcssa$i|0)==($174|0);
        if ($175) {
         HEAP32[$173>>2] = $$3$i;
         $cond$i = ($$3$i|0)==(0|0);
         if ($cond$i) {
          $176 = 1 << $172;
          $177 = $176 ^ -1;
          $178 = $98 & $177;
          HEAP32[(10572)>>2] = $178;
          break;
         }
        } else {
         $179 = ((($150)) + 16|0);
         $180 = HEAP32[$179>>2]|0;
         $181 = ($180|0)!=($$0172$lcssa$i|0);
         $$sink2$i = $181&1;
         $182 = (((($150)) + 16|0) + ($$sink2$i<<2)|0);
         HEAP32[$182>>2] = $$3$i;
         $183 = ($$3$i|0)==(0|0);
         if ($183) {
          break;
         }
        }
        $184 = ((($$3$i)) + 24|0);
        HEAP32[$184>>2] = $150;
        $185 = ((($$0172$lcssa$i)) + 16|0);
        $186 = HEAP32[$185>>2]|0;
        $187 = ($186|0)==(0|0);
        if (!($187)) {
         $188 = ((($$3$i)) + 16|0);
         HEAP32[$188>>2] = $186;
         $189 = ((($186)) + 24|0);
         HEAP32[$189>>2] = $$3$i;
        }
        $190 = ((($$0172$lcssa$i)) + 20|0);
        $191 = HEAP32[$190>>2]|0;
        $192 = ($191|0)==(0|0);
        if (!($192)) {
         $193 = ((($$3$i)) + 20|0);
         HEAP32[$193>>2] = $191;
         $194 = ((($191)) + 24|0);
         HEAP32[$194>>2] = $$3$i;
        }
       }
      } while(0);
      $195 = ($$0173$lcssa$i>>>0)<(16);
      if ($195) {
       $196 = (($$0173$lcssa$i) + ($6))|0;
       $197 = $196 | 3;
       $198 = ((($$0172$lcssa$i)) + 4|0);
       HEAP32[$198>>2] = $197;
       $199 = (($$0172$lcssa$i) + ($196)|0);
       $200 = ((($199)) + 4|0);
       $201 = HEAP32[$200>>2]|0;
       $202 = $201 | 1;
       HEAP32[$200>>2] = $202;
      } else {
       $203 = $6 | 3;
       $204 = ((($$0172$lcssa$i)) + 4|0);
       HEAP32[$204>>2] = $203;
       $205 = $$0173$lcssa$i | 1;
       $206 = ((($147)) + 4|0);
       HEAP32[$206>>2] = $205;
       $207 = (($147) + ($$0173$lcssa$i)|0);
       HEAP32[$207>>2] = $$0173$lcssa$i;
       $208 = ($33|0)==(0);
       if (!($208)) {
        $209 = HEAP32[(10588)>>2]|0;
        $210 = $33 >>> 3;
        $211 = $210 << 1;
        $212 = (10608 + ($211<<2)|0);
        $213 = 1 << $210;
        $214 = $8 & $213;
        $215 = ($214|0)==(0);
        if ($215) {
         $216 = $8 | $213;
         HEAP32[2642] = $216;
         $$pre$i = ((($212)) + 8|0);
         $$0$i = $212;$$pre$phi$iZ2D = $$pre$i;
        } else {
         $217 = ((($212)) + 8|0);
         $218 = HEAP32[$217>>2]|0;
         $$0$i = $218;$$pre$phi$iZ2D = $217;
        }
        HEAP32[$$pre$phi$iZ2D>>2] = $209;
        $219 = ((($$0$i)) + 12|0);
        HEAP32[$219>>2] = $209;
        $220 = ((($209)) + 8|0);
        HEAP32[$220>>2] = $$0$i;
        $221 = ((($209)) + 12|0);
        HEAP32[$221>>2] = $212;
       }
       HEAP32[(10576)>>2] = $$0173$lcssa$i;
       HEAP32[(10588)>>2] = $147;
      }
      $222 = ((($$0172$lcssa$i)) + 8|0);
      $$0 = $222;
      STACKTOP = sp;return ($$0|0);
     } else {
      $$0192 = $6;
     }
    }
   } else {
    $$0192 = $6;
   }
  } else {
   $223 = ($0>>>0)>(4294967231);
   if ($223) {
    $$0192 = -1;
   } else {
    $224 = (($0) + 11)|0;
    $225 = $224 & -8;
    $226 = HEAP32[(10572)>>2]|0;
    $227 = ($226|0)==(0);
    if ($227) {
     $$0192 = $225;
    } else {
     $228 = (0 - ($225))|0;
     $229 = $224 >>> 8;
     $230 = ($229|0)==(0);
     if ($230) {
      $$0336$i = 0;
     } else {
      $231 = ($225>>>0)>(16777215);
      if ($231) {
       $$0336$i = 31;
      } else {
       $232 = (($229) + 1048320)|0;
       $233 = $232 >>> 16;
       $234 = $233 & 8;
       $235 = $229 << $234;
       $236 = (($235) + 520192)|0;
       $237 = $236 >>> 16;
       $238 = $237 & 4;
       $239 = $238 | $234;
       $240 = $235 << $238;
       $241 = (($240) + 245760)|0;
       $242 = $241 >>> 16;
       $243 = $242 & 2;
       $244 = $239 | $243;
       $245 = (14 - ($244))|0;
       $246 = $240 << $243;
       $247 = $246 >>> 15;
       $248 = (($245) + ($247))|0;
       $249 = $248 << 1;
       $250 = (($248) + 7)|0;
       $251 = $225 >>> $250;
       $252 = $251 & 1;
       $253 = $252 | $249;
       $$0336$i = $253;
      }
     }
     $254 = (10872 + ($$0336$i<<2)|0);
     $255 = HEAP32[$254>>2]|0;
     $256 = ($255|0)==(0|0);
     L74: do {
      if ($256) {
       $$2333$i = 0;$$3$i199 = 0;$$3328$i = $228;
       label = 57;
      } else {
       $257 = ($$0336$i|0)==(31);
       $258 = $$0336$i >>> 1;
       $259 = (25 - ($258))|0;
       $260 = $257 ? 0 : $259;
       $261 = $225 << $260;
       $$0320$i = 0;$$0325$i = $228;$$0331$i = $255;$$0337$i = $261;$$0340$i = 0;
       while(1) {
        $262 = ((($$0331$i)) + 4|0);
        $263 = HEAP32[$262>>2]|0;
        $264 = $263 & -8;
        $265 = (($264) - ($225))|0;
        $266 = ($265>>>0)<($$0325$i>>>0);
        if ($266) {
         $267 = ($265|0)==(0);
         if ($267) {
          $$43298$i = 0;$$43357$i = $$0331$i;$$49$i = $$0331$i;
          label = 61;
          break L74;
         } else {
          $$1321$i = $$0331$i;$$1326$i = $265;
         }
        } else {
         $$1321$i = $$0320$i;$$1326$i = $$0325$i;
        }
        $268 = ((($$0331$i)) + 20|0);
        $269 = HEAP32[$268>>2]|0;
        $270 = $$0337$i >>> 31;
        $271 = (((($$0331$i)) + 16|0) + ($270<<2)|0);
        $272 = HEAP32[$271>>2]|0;
        $273 = ($269|0)==(0|0);
        $274 = ($269|0)==($272|0);
        $or$cond1$i198 = $273 | $274;
        $$1341$i = $or$cond1$i198 ? $$0340$i : $269;
        $275 = ($272|0)==(0|0);
        $not$3$i = $275 ^ 1;
        $276 = $not$3$i&1;
        $$0337$$i = $$0337$i << $276;
        if ($275) {
         $$2333$i = $$1341$i;$$3$i199 = $$1321$i;$$3328$i = $$1326$i;
         label = 57;
         break;
        } else {
         $$0320$i = $$1321$i;$$0325$i = $$1326$i;$$0331$i = $272;$$0337$i = $$0337$$i;$$0340$i = $$1341$i;
        }
       }
      }
     } while(0);
     if ((label|0) == 57) {
      $277 = ($$2333$i|0)==(0|0);
      $278 = ($$3$i199|0)==(0|0);
      $or$cond$i200 = $277 & $278;
      if ($or$cond$i200) {
       $279 = 2 << $$0336$i;
       $280 = (0 - ($279))|0;
       $281 = $279 | $280;
       $282 = $226 & $281;
       $283 = ($282|0)==(0);
       if ($283) {
        $$0192 = $225;
        break;
       }
       $284 = (0 - ($282))|0;
       $285 = $282 & $284;
       $286 = (($285) + -1)|0;
       $287 = $286 >>> 12;
       $288 = $287 & 16;
       $289 = $286 >>> $288;
       $290 = $289 >>> 5;
       $291 = $290 & 8;
       $292 = $291 | $288;
       $293 = $289 >>> $291;
       $294 = $293 >>> 2;
       $295 = $294 & 4;
       $296 = $292 | $295;
       $297 = $293 >>> $295;
       $298 = $297 >>> 1;
       $299 = $298 & 2;
       $300 = $296 | $299;
       $301 = $297 >>> $299;
       $302 = $301 >>> 1;
       $303 = $302 & 1;
       $304 = $300 | $303;
       $305 = $301 >>> $303;
       $306 = (($304) + ($305))|0;
       $307 = (10872 + ($306<<2)|0);
       $308 = HEAP32[$307>>2]|0;
       $$4$ph$i = 0;$$4335$ph$i = $308;
      } else {
       $$4$ph$i = $$3$i199;$$4335$ph$i = $$2333$i;
      }
      $309 = ($$4335$ph$i|0)==(0|0);
      if ($309) {
       $$4$lcssa$i = $$4$ph$i;$$4329$lcssa$i = $$3328$i;
      } else {
       $$43298$i = $$3328$i;$$43357$i = $$4335$ph$i;$$49$i = $$4$ph$i;
       label = 61;
      }
     }
     if ((label|0) == 61) {
      while(1) {
       label = 0;
       $310 = ((($$43357$i)) + 4|0);
       $311 = HEAP32[$310>>2]|0;
       $312 = $311 & -8;
       $313 = (($312) - ($225))|0;
       $314 = ($313>>>0)<($$43298$i>>>0);
       $$$4329$i = $314 ? $313 : $$43298$i;
       $$4335$$4$i = $314 ? $$43357$i : $$49$i;
       $315 = ((($$43357$i)) + 16|0);
       $316 = HEAP32[$315>>2]|0;
       $317 = ($316|0)==(0|0);
       $$sink2$i202 = $317&1;
       $318 = (((($$43357$i)) + 16|0) + ($$sink2$i202<<2)|0);
       $319 = HEAP32[$318>>2]|0;
       $320 = ($319|0)==(0|0);
       if ($320) {
        $$4$lcssa$i = $$4335$$4$i;$$4329$lcssa$i = $$$4329$i;
        break;
       } else {
        $$43298$i = $$$4329$i;$$43357$i = $319;$$49$i = $$4335$$4$i;
        label = 61;
       }
      }
     }
     $321 = ($$4$lcssa$i|0)==(0|0);
     if ($321) {
      $$0192 = $225;
     } else {
      $322 = HEAP32[(10576)>>2]|0;
      $323 = (($322) - ($225))|0;
      $324 = ($$4329$lcssa$i>>>0)<($323>>>0);
      if ($324) {
       $325 = (($$4$lcssa$i) + ($225)|0);
       $326 = ($325>>>0)>($$4$lcssa$i>>>0);
       if (!($326)) {
        $$0 = 0;
        STACKTOP = sp;return ($$0|0);
       }
       $327 = ((($$4$lcssa$i)) + 24|0);
       $328 = HEAP32[$327>>2]|0;
       $329 = ((($$4$lcssa$i)) + 12|0);
       $330 = HEAP32[$329>>2]|0;
       $331 = ($330|0)==($$4$lcssa$i|0);
       do {
        if ($331) {
         $336 = ((($$4$lcssa$i)) + 20|0);
         $337 = HEAP32[$336>>2]|0;
         $338 = ($337|0)==(0|0);
         if ($338) {
          $339 = ((($$4$lcssa$i)) + 16|0);
          $340 = HEAP32[$339>>2]|0;
          $341 = ($340|0)==(0|0);
          if ($341) {
           $$3349$i = 0;
           break;
          } else {
           $$1347$i = $340;$$1351$i = $339;
          }
         } else {
          $$1347$i = $337;$$1351$i = $336;
         }
         while(1) {
          $342 = ((($$1347$i)) + 20|0);
          $343 = HEAP32[$342>>2]|0;
          $344 = ($343|0)==(0|0);
          if (!($344)) {
           $$1347$i = $343;$$1351$i = $342;
           continue;
          }
          $345 = ((($$1347$i)) + 16|0);
          $346 = HEAP32[$345>>2]|0;
          $347 = ($346|0)==(0|0);
          if ($347) {
           break;
          } else {
           $$1347$i = $346;$$1351$i = $345;
          }
         }
         HEAP32[$$1351$i>>2] = 0;
         $$3349$i = $$1347$i;
        } else {
         $332 = ((($$4$lcssa$i)) + 8|0);
         $333 = HEAP32[$332>>2]|0;
         $334 = ((($333)) + 12|0);
         HEAP32[$334>>2] = $330;
         $335 = ((($330)) + 8|0);
         HEAP32[$335>>2] = $333;
         $$3349$i = $330;
        }
       } while(0);
       $348 = ($328|0)==(0|0);
       do {
        if ($348) {
         $431 = $226;
        } else {
         $349 = ((($$4$lcssa$i)) + 28|0);
         $350 = HEAP32[$349>>2]|0;
         $351 = (10872 + ($350<<2)|0);
         $352 = HEAP32[$351>>2]|0;
         $353 = ($$4$lcssa$i|0)==($352|0);
         if ($353) {
          HEAP32[$351>>2] = $$3349$i;
          $cond$i206 = ($$3349$i|0)==(0|0);
          if ($cond$i206) {
           $354 = 1 << $350;
           $355 = $354 ^ -1;
           $356 = $226 & $355;
           HEAP32[(10572)>>2] = $356;
           $431 = $356;
           break;
          }
         } else {
          $357 = ((($328)) + 16|0);
          $358 = HEAP32[$357>>2]|0;
          $359 = ($358|0)!=($$4$lcssa$i|0);
          $$sink3$i = $359&1;
          $360 = (((($328)) + 16|0) + ($$sink3$i<<2)|0);
          HEAP32[$360>>2] = $$3349$i;
          $361 = ($$3349$i|0)==(0|0);
          if ($361) {
           $431 = $226;
           break;
          }
         }
         $362 = ((($$3349$i)) + 24|0);
         HEAP32[$362>>2] = $328;
         $363 = ((($$4$lcssa$i)) + 16|0);
         $364 = HEAP32[$363>>2]|0;
         $365 = ($364|0)==(0|0);
         if (!($365)) {
          $366 = ((($$3349$i)) + 16|0);
          HEAP32[$366>>2] = $364;
          $367 = ((($364)) + 24|0);
          HEAP32[$367>>2] = $$3349$i;
         }
         $368 = ((($$4$lcssa$i)) + 20|0);
         $369 = HEAP32[$368>>2]|0;
         $370 = ($369|0)==(0|0);
         if ($370) {
          $431 = $226;
         } else {
          $371 = ((($$3349$i)) + 20|0);
          HEAP32[$371>>2] = $369;
          $372 = ((($369)) + 24|0);
          HEAP32[$372>>2] = $$3349$i;
          $431 = $226;
         }
        }
       } while(0);
       $373 = ($$4329$lcssa$i>>>0)<(16);
       do {
        if ($373) {
         $374 = (($$4329$lcssa$i) + ($225))|0;
         $375 = $374 | 3;
         $376 = ((($$4$lcssa$i)) + 4|0);
         HEAP32[$376>>2] = $375;
         $377 = (($$4$lcssa$i) + ($374)|0);
         $378 = ((($377)) + 4|0);
         $379 = HEAP32[$378>>2]|0;
         $380 = $379 | 1;
         HEAP32[$378>>2] = $380;
        } else {
         $381 = $225 | 3;
         $382 = ((($$4$lcssa$i)) + 4|0);
         HEAP32[$382>>2] = $381;
         $383 = $$4329$lcssa$i | 1;
         $384 = ((($325)) + 4|0);
         HEAP32[$384>>2] = $383;
         $385 = (($325) + ($$4329$lcssa$i)|0);
         HEAP32[$385>>2] = $$4329$lcssa$i;
         $386 = $$4329$lcssa$i >>> 3;
         $387 = ($$4329$lcssa$i>>>0)<(256);
         if ($387) {
          $388 = $386 << 1;
          $389 = (10608 + ($388<<2)|0);
          $390 = HEAP32[2642]|0;
          $391 = 1 << $386;
          $392 = $390 & $391;
          $393 = ($392|0)==(0);
          if ($393) {
           $394 = $390 | $391;
           HEAP32[2642] = $394;
           $$pre$i207 = ((($389)) + 8|0);
           $$0345$i = $389;$$pre$phi$i208Z2D = $$pre$i207;
          } else {
           $395 = ((($389)) + 8|0);
           $396 = HEAP32[$395>>2]|0;
           $$0345$i = $396;$$pre$phi$i208Z2D = $395;
          }
          HEAP32[$$pre$phi$i208Z2D>>2] = $325;
          $397 = ((($$0345$i)) + 12|0);
          HEAP32[$397>>2] = $325;
          $398 = ((($325)) + 8|0);
          HEAP32[$398>>2] = $$0345$i;
          $399 = ((($325)) + 12|0);
          HEAP32[$399>>2] = $389;
          break;
         }
         $400 = $$4329$lcssa$i >>> 8;
         $401 = ($400|0)==(0);
         if ($401) {
          $$0339$i = 0;
         } else {
          $402 = ($$4329$lcssa$i>>>0)>(16777215);
          if ($402) {
           $$0339$i = 31;
          } else {
           $403 = (($400) + 1048320)|0;
           $404 = $403 >>> 16;
           $405 = $404 & 8;
           $406 = $400 << $405;
           $407 = (($406) + 520192)|0;
           $408 = $407 >>> 16;
           $409 = $408 & 4;
           $410 = $409 | $405;
           $411 = $406 << $409;
           $412 = (($411) + 245760)|0;
           $413 = $412 >>> 16;
           $414 = $413 & 2;
           $415 = $410 | $414;
           $416 = (14 - ($415))|0;
           $417 = $411 << $414;
           $418 = $417 >>> 15;
           $419 = (($416) + ($418))|0;
           $420 = $419 << 1;
           $421 = (($419) + 7)|0;
           $422 = $$4329$lcssa$i >>> $421;
           $423 = $422 & 1;
           $424 = $423 | $420;
           $$0339$i = $424;
          }
         }
         $425 = (10872 + ($$0339$i<<2)|0);
         $426 = ((($325)) + 28|0);
         HEAP32[$426>>2] = $$0339$i;
         $427 = ((($325)) + 16|0);
         $428 = ((($427)) + 4|0);
         HEAP32[$428>>2] = 0;
         HEAP32[$427>>2] = 0;
         $429 = 1 << $$0339$i;
         $430 = $431 & $429;
         $432 = ($430|0)==(0);
         if ($432) {
          $433 = $431 | $429;
          HEAP32[(10572)>>2] = $433;
          HEAP32[$425>>2] = $325;
          $434 = ((($325)) + 24|0);
          HEAP32[$434>>2] = $425;
          $435 = ((($325)) + 12|0);
          HEAP32[$435>>2] = $325;
          $436 = ((($325)) + 8|0);
          HEAP32[$436>>2] = $325;
          break;
         }
         $437 = HEAP32[$425>>2]|0;
         $438 = ($$0339$i|0)==(31);
         $439 = $$0339$i >>> 1;
         $440 = (25 - ($439))|0;
         $441 = $438 ? 0 : $440;
         $442 = $$4329$lcssa$i << $441;
         $$0322$i = $442;$$0323$i = $437;
         while(1) {
          $443 = ((($$0323$i)) + 4|0);
          $444 = HEAP32[$443>>2]|0;
          $445 = $444 & -8;
          $446 = ($445|0)==($$4329$lcssa$i|0);
          if ($446) {
           label = 97;
           break;
          }
          $447 = $$0322$i >>> 31;
          $448 = (((($$0323$i)) + 16|0) + ($447<<2)|0);
          $449 = $$0322$i << 1;
          $450 = HEAP32[$448>>2]|0;
          $451 = ($450|0)==(0|0);
          if ($451) {
           label = 96;
           break;
          } else {
           $$0322$i = $449;$$0323$i = $450;
          }
         }
         if ((label|0) == 96) {
          HEAP32[$448>>2] = $325;
          $452 = ((($325)) + 24|0);
          HEAP32[$452>>2] = $$0323$i;
          $453 = ((($325)) + 12|0);
          HEAP32[$453>>2] = $325;
          $454 = ((($325)) + 8|0);
          HEAP32[$454>>2] = $325;
          break;
         }
         else if ((label|0) == 97) {
          $455 = ((($$0323$i)) + 8|0);
          $456 = HEAP32[$455>>2]|0;
          $457 = ((($456)) + 12|0);
          HEAP32[$457>>2] = $325;
          HEAP32[$455>>2] = $325;
          $458 = ((($325)) + 8|0);
          HEAP32[$458>>2] = $456;
          $459 = ((($325)) + 12|0);
          HEAP32[$459>>2] = $$0323$i;
          $460 = ((($325)) + 24|0);
          HEAP32[$460>>2] = 0;
          break;
         }
        }
       } while(0);
       $461 = ((($$4$lcssa$i)) + 8|0);
       $$0 = $461;
       STACKTOP = sp;return ($$0|0);
      } else {
       $$0192 = $225;
      }
     }
    }
   }
  }
 } while(0);
 $462 = HEAP32[(10576)>>2]|0;
 $463 = ($462>>>0)<($$0192>>>0);
 if (!($463)) {
  $464 = (($462) - ($$0192))|0;
  $465 = HEAP32[(10588)>>2]|0;
  $466 = ($464>>>0)>(15);
  if ($466) {
   $467 = (($465) + ($$0192)|0);
   HEAP32[(10588)>>2] = $467;
   HEAP32[(10576)>>2] = $464;
   $468 = $464 | 1;
   $469 = ((($467)) + 4|0);
   HEAP32[$469>>2] = $468;
   $470 = (($465) + ($462)|0);
   HEAP32[$470>>2] = $464;
   $471 = $$0192 | 3;
   $472 = ((($465)) + 4|0);
   HEAP32[$472>>2] = $471;
  } else {
   HEAP32[(10576)>>2] = 0;
   HEAP32[(10588)>>2] = 0;
   $473 = $462 | 3;
   $474 = ((($465)) + 4|0);
   HEAP32[$474>>2] = $473;
   $475 = (($465) + ($462)|0);
   $476 = ((($475)) + 4|0);
   $477 = HEAP32[$476>>2]|0;
   $478 = $477 | 1;
   HEAP32[$476>>2] = $478;
  }
  $479 = ((($465)) + 8|0);
  $$0 = $479;
  STACKTOP = sp;return ($$0|0);
 }
 $480 = HEAP32[(10580)>>2]|0;
 $481 = ($480>>>0)>($$0192>>>0);
 if ($481) {
  $482 = (($480) - ($$0192))|0;
  HEAP32[(10580)>>2] = $482;
  $483 = HEAP32[(10592)>>2]|0;
  $484 = (($483) + ($$0192)|0);
  HEAP32[(10592)>>2] = $484;
  $485 = $482 | 1;
  $486 = ((($484)) + 4|0);
  HEAP32[$486>>2] = $485;
  $487 = $$0192 | 3;
  $488 = ((($483)) + 4|0);
  HEAP32[$488>>2] = $487;
  $489 = ((($483)) + 8|0);
  $$0 = $489;
  STACKTOP = sp;return ($$0|0);
 }
 $490 = HEAP32[2760]|0;
 $491 = ($490|0)==(0);
 if ($491) {
  HEAP32[(11048)>>2] = 4096;
  HEAP32[(11044)>>2] = 4096;
  HEAP32[(11052)>>2] = -1;
  HEAP32[(11056)>>2] = -1;
  HEAP32[(11060)>>2] = 0;
  HEAP32[(11012)>>2] = 0;
  $492 = $1;
  $493 = $492 & -16;
  $494 = $493 ^ 1431655768;
  HEAP32[2760] = $494;
  $498 = 4096;
 } else {
  $$pre$i195 = HEAP32[(11048)>>2]|0;
  $498 = $$pre$i195;
 }
 $495 = (($$0192) + 48)|0;
 $496 = (($$0192) + 47)|0;
 $497 = (($498) + ($496))|0;
 $499 = (0 - ($498))|0;
 $500 = $497 & $499;
 $501 = ($500>>>0)>($$0192>>>0);
 if (!($501)) {
  $$0 = 0;
  STACKTOP = sp;return ($$0|0);
 }
 $502 = HEAP32[(11008)>>2]|0;
 $503 = ($502|0)==(0);
 if (!($503)) {
  $504 = HEAP32[(11000)>>2]|0;
  $505 = (($504) + ($500))|0;
  $506 = ($505>>>0)<=($504>>>0);
  $507 = ($505>>>0)>($502>>>0);
  $or$cond1$i = $506 | $507;
  if ($or$cond1$i) {
   $$0 = 0;
   STACKTOP = sp;return ($$0|0);
  }
 }
 $508 = HEAP32[(11012)>>2]|0;
 $509 = $508 & 4;
 $510 = ($509|0)==(0);
 L167: do {
  if ($510) {
   $511 = HEAP32[(10592)>>2]|0;
   $512 = ($511|0)==(0|0);
   L169: do {
    if ($512) {
     label = 118;
    } else {
     $$0$i20$i = (11016);
     while(1) {
      $513 = HEAP32[$$0$i20$i>>2]|0;
      $514 = ($513>>>0)>($511>>>0);
      if (!($514)) {
       $515 = ((($$0$i20$i)) + 4|0);
       $516 = HEAP32[$515>>2]|0;
       $517 = (($513) + ($516)|0);
       $518 = ($517>>>0)>($511>>>0);
       if ($518) {
        break;
       }
      }
      $519 = ((($$0$i20$i)) + 8|0);
      $520 = HEAP32[$519>>2]|0;
      $521 = ($520|0)==(0|0);
      if ($521) {
       label = 118;
       break L169;
      } else {
       $$0$i20$i = $520;
      }
     }
     $544 = (($497) - ($480))|0;
     $545 = $544 & $499;
     $546 = ($545>>>0)<(2147483647);
     if ($546) {
      $547 = (_sbrk(($545|0))|0);
      $548 = HEAP32[$$0$i20$i>>2]|0;
      $549 = HEAP32[$515>>2]|0;
      $550 = (($548) + ($549)|0);
      $551 = ($547|0)==($550|0);
      if ($551) {
       $552 = ($547|0)==((-1)|0);
       if ($552) {
        $$2234243136$i = $545;
       } else {
        $$723947$i = $545;$$748$i = $547;
        label = 135;
        break L167;
       }
      } else {
       $$2247$ph$i = $547;$$2253$ph$i = $545;
       label = 126;
      }
     } else {
      $$2234243136$i = 0;
     }
    }
   } while(0);
   do {
    if ((label|0) == 118) {
     $522 = (_sbrk(0)|0);
     $523 = ($522|0)==((-1)|0);
     if ($523) {
      $$2234243136$i = 0;
     } else {
      $524 = $522;
      $525 = HEAP32[(11044)>>2]|0;
      $526 = (($525) + -1)|0;
      $527 = $526 & $524;
      $528 = ($527|0)==(0);
      $529 = (($526) + ($524))|0;
      $530 = (0 - ($525))|0;
      $531 = $529 & $530;
      $532 = (($531) - ($524))|0;
      $533 = $528 ? 0 : $532;
      $$$i = (($533) + ($500))|0;
      $534 = HEAP32[(11000)>>2]|0;
      $535 = (($$$i) + ($534))|0;
      $536 = ($$$i>>>0)>($$0192>>>0);
      $537 = ($$$i>>>0)<(2147483647);
      $or$cond$i = $536 & $537;
      if ($or$cond$i) {
       $538 = HEAP32[(11008)>>2]|0;
       $539 = ($538|0)==(0);
       if (!($539)) {
        $540 = ($535>>>0)<=($534>>>0);
        $541 = ($535>>>0)>($538>>>0);
        $or$cond2$i = $540 | $541;
        if ($or$cond2$i) {
         $$2234243136$i = 0;
         break;
        }
       }
       $542 = (_sbrk(($$$i|0))|0);
       $543 = ($542|0)==($522|0);
       if ($543) {
        $$723947$i = $$$i;$$748$i = $522;
        label = 135;
        break L167;
       } else {
        $$2247$ph$i = $542;$$2253$ph$i = $$$i;
        label = 126;
       }
      } else {
       $$2234243136$i = 0;
      }
     }
    }
   } while(0);
   do {
    if ((label|0) == 126) {
     $553 = (0 - ($$2253$ph$i))|0;
     $554 = ($$2247$ph$i|0)!=((-1)|0);
     $555 = ($$2253$ph$i>>>0)<(2147483647);
     $or$cond7$i = $555 & $554;
     $556 = ($495>>>0)>($$2253$ph$i>>>0);
     $or$cond10$i = $556 & $or$cond7$i;
     if (!($or$cond10$i)) {
      $566 = ($$2247$ph$i|0)==((-1)|0);
      if ($566) {
       $$2234243136$i = 0;
       break;
      } else {
       $$723947$i = $$2253$ph$i;$$748$i = $$2247$ph$i;
       label = 135;
       break L167;
      }
     }
     $557 = HEAP32[(11048)>>2]|0;
     $558 = (($496) - ($$2253$ph$i))|0;
     $559 = (($558) + ($557))|0;
     $560 = (0 - ($557))|0;
     $561 = $559 & $560;
     $562 = ($561>>>0)<(2147483647);
     if (!($562)) {
      $$723947$i = $$2253$ph$i;$$748$i = $$2247$ph$i;
      label = 135;
      break L167;
     }
     $563 = (_sbrk(($561|0))|0);
     $564 = ($563|0)==((-1)|0);
     if ($564) {
      (_sbrk(($553|0))|0);
      $$2234243136$i = 0;
      break;
     } else {
      $565 = (($561) + ($$2253$ph$i))|0;
      $$723947$i = $565;$$748$i = $$2247$ph$i;
      label = 135;
      break L167;
     }
    }
   } while(0);
   $567 = HEAP32[(11012)>>2]|0;
   $568 = $567 | 4;
   HEAP32[(11012)>>2] = $568;
   $$4236$i = $$2234243136$i;
   label = 133;
  } else {
   $$4236$i = 0;
   label = 133;
  }
 } while(0);
 if ((label|0) == 133) {
  $569 = ($500>>>0)<(2147483647);
  if ($569) {
   $570 = (_sbrk(($500|0))|0);
   $571 = (_sbrk(0)|0);
   $572 = ($570|0)!=((-1)|0);
   $573 = ($571|0)!=((-1)|0);
   $or$cond5$i = $572 & $573;
   $574 = ($570>>>0)<($571>>>0);
   $or$cond11$i = $574 & $or$cond5$i;
   $575 = $571;
   $576 = $570;
   $577 = (($575) - ($576))|0;
   $578 = (($$0192) + 40)|0;
   $579 = ($577>>>0)>($578>>>0);
   $$$4236$i = $579 ? $577 : $$4236$i;
   $or$cond11$not$i = $or$cond11$i ^ 1;
   $580 = ($570|0)==((-1)|0);
   $not$$i = $579 ^ 1;
   $581 = $580 | $not$$i;
   $or$cond49$i = $581 | $or$cond11$not$i;
   if (!($or$cond49$i)) {
    $$723947$i = $$$4236$i;$$748$i = $570;
    label = 135;
   }
  }
 }
 if ((label|0) == 135) {
  $582 = HEAP32[(11000)>>2]|0;
  $583 = (($582) + ($$723947$i))|0;
  HEAP32[(11000)>>2] = $583;
  $584 = HEAP32[(11004)>>2]|0;
  $585 = ($583>>>0)>($584>>>0);
  if ($585) {
   HEAP32[(11004)>>2] = $583;
  }
  $586 = HEAP32[(10592)>>2]|0;
  $587 = ($586|0)==(0|0);
  do {
   if ($587) {
    $588 = HEAP32[(10584)>>2]|0;
    $589 = ($588|0)==(0|0);
    $590 = ($$748$i>>>0)<($588>>>0);
    $or$cond12$i = $589 | $590;
    if ($or$cond12$i) {
     HEAP32[(10584)>>2] = $$748$i;
    }
    HEAP32[(11016)>>2] = $$748$i;
    HEAP32[(11020)>>2] = $$723947$i;
    HEAP32[(11028)>>2] = 0;
    $591 = HEAP32[2760]|0;
    HEAP32[(10604)>>2] = $591;
    HEAP32[(10600)>>2] = -1;
    HEAP32[(10620)>>2] = (10608);
    HEAP32[(10616)>>2] = (10608);
    HEAP32[(10628)>>2] = (10616);
    HEAP32[(10624)>>2] = (10616);
    HEAP32[(10636)>>2] = (10624);
    HEAP32[(10632)>>2] = (10624);
    HEAP32[(10644)>>2] = (10632);
    HEAP32[(10640)>>2] = (10632);
    HEAP32[(10652)>>2] = (10640);
    HEAP32[(10648)>>2] = (10640);
    HEAP32[(10660)>>2] = (10648);
    HEAP32[(10656)>>2] = (10648);
    HEAP32[(10668)>>2] = (10656);
    HEAP32[(10664)>>2] = (10656);
    HEAP32[(10676)>>2] = (10664);
    HEAP32[(10672)>>2] = (10664);
    HEAP32[(10684)>>2] = (10672);
    HEAP32[(10680)>>2] = (10672);
    HEAP32[(10692)>>2] = (10680);
    HEAP32[(10688)>>2] = (10680);
    HEAP32[(10700)>>2] = (10688);
    HEAP32[(10696)>>2] = (10688);
    HEAP32[(10708)>>2] = (10696);
    HEAP32[(10704)>>2] = (10696);
    HEAP32[(10716)>>2] = (10704);
    HEAP32[(10712)>>2] = (10704);
    HEAP32[(10724)>>2] = (10712);
    HEAP32[(10720)>>2] = (10712);
    HEAP32[(10732)>>2] = (10720);
    HEAP32[(10728)>>2] = (10720);
    HEAP32[(10740)>>2] = (10728);
    HEAP32[(10736)>>2] = (10728);
    HEAP32[(10748)>>2] = (10736);
    HEAP32[(10744)>>2] = (10736);
    HEAP32[(10756)>>2] = (10744);
    HEAP32[(10752)>>2] = (10744);
    HEAP32[(10764)>>2] = (10752);
    HEAP32[(10760)>>2] = (10752);
    HEAP32[(10772)>>2] = (10760);
    HEAP32[(10768)>>2] = (10760);
    HEAP32[(10780)>>2] = (10768);
    HEAP32[(10776)>>2] = (10768);
    HEAP32[(10788)>>2] = (10776);
    HEAP32[(10784)>>2] = (10776);
    HEAP32[(10796)>>2] = (10784);
    HEAP32[(10792)>>2] = (10784);
    HEAP32[(10804)>>2] = (10792);
    HEAP32[(10800)>>2] = (10792);
    HEAP32[(10812)>>2] = (10800);
    HEAP32[(10808)>>2] = (10800);
    HEAP32[(10820)>>2] = (10808);
    HEAP32[(10816)>>2] = (10808);
    HEAP32[(10828)>>2] = (10816);
    HEAP32[(10824)>>2] = (10816);
    HEAP32[(10836)>>2] = (10824);
    HEAP32[(10832)>>2] = (10824);
    HEAP32[(10844)>>2] = (10832);
    HEAP32[(10840)>>2] = (10832);
    HEAP32[(10852)>>2] = (10840);
    HEAP32[(10848)>>2] = (10840);
    HEAP32[(10860)>>2] = (10848);
    HEAP32[(10856)>>2] = (10848);
    HEAP32[(10868)>>2] = (10856);
    HEAP32[(10864)>>2] = (10856);
    $592 = (($$723947$i) + -40)|0;
    $593 = ((($$748$i)) + 8|0);
    $594 = $593;
    $595 = $594 & 7;
    $596 = ($595|0)==(0);
    $597 = (0 - ($594))|0;
    $598 = $597 & 7;
    $599 = $596 ? 0 : $598;
    $600 = (($$748$i) + ($599)|0);
    $601 = (($592) - ($599))|0;
    HEAP32[(10592)>>2] = $600;
    HEAP32[(10580)>>2] = $601;
    $602 = $601 | 1;
    $603 = ((($600)) + 4|0);
    HEAP32[$603>>2] = $602;
    $604 = (($$748$i) + ($592)|0);
    $605 = ((($604)) + 4|0);
    HEAP32[$605>>2] = 40;
    $606 = HEAP32[(11056)>>2]|0;
    HEAP32[(10596)>>2] = $606;
   } else {
    $$024367$i = (11016);
    while(1) {
     $607 = HEAP32[$$024367$i>>2]|0;
     $608 = ((($$024367$i)) + 4|0);
     $609 = HEAP32[$608>>2]|0;
     $610 = (($607) + ($609)|0);
     $611 = ($$748$i|0)==($610|0);
     if ($611) {
      label = 143;
      break;
     }
     $612 = ((($$024367$i)) + 8|0);
     $613 = HEAP32[$612>>2]|0;
     $614 = ($613|0)==(0|0);
     if ($614) {
      break;
     } else {
      $$024367$i = $613;
     }
    }
    if ((label|0) == 143) {
     $615 = ((($$024367$i)) + 12|0);
     $616 = HEAP32[$615>>2]|0;
     $617 = $616 & 8;
     $618 = ($617|0)==(0);
     if ($618) {
      $619 = ($607>>>0)<=($586>>>0);
      $620 = ($$748$i>>>0)>($586>>>0);
      $or$cond50$i = $620 & $619;
      if ($or$cond50$i) {
       $621 = (($609) + ($$723947$i))|0;
       HEAP32[$608>>2] = $621;
       $622 = HEAP32[(10580)>>2]|0;
       $623 = (($622) + ($$723947$i))|0;
       $624 = ((($586)) + 8|0);
       $625 = $624;
       $626 = $625 & 7;
       $627 = ($626|0)==(0);
       $628 = (0 - ($625))|0;
       $629 = $628 & 7;
       $630 = $627 ? 0 : $629;
       $631 = (($586) + ($630)|0);
       $632 = (($623) - ($630))|0;
       HEAP32[(10592)>>2] = $631;
       HEAP32[(10580)>>2] = $632;
       $633 = $632 | 1;
       $634 = ((($631)) + 4|0);
       HEAP32[$634>>2] = $633;
       $635 = (($586) + ($623)|0);
       $636 = ((($635)) + 4|0);
       HEAP32[$636>>2] = 40;
       $637 = HEAP32[(11056)>>2]|0;
       HEAP32[(10596)>>2] = $637;
       break;
      }
     }
    }
    $638 = HEAP32[(10584)>>2]|0;
    $639 = ($$748$i>>>0)<($638>>>0);
    if ($639) {
     HEAP32[(10584)>>2] = $$748$i;
    }
    $640 = (($$748$i) + ($$723947$i)|0);
    $$124466$i = (11016);
    while(1) {
     $641 = HEAP32[$$124466$i>>2]|0;
     $642 = ($641|0)==($640|0);
     if ($642) {
      label = 151;
      break;
     }
     $643 = ((($$124466$i)) + 8|0);
     $644 = HEAP32[$643>>2]|0;
     $645 = ($644|0)==(0|0);
     if ($645) {
      $$0$i$i$i = (11016);
      break;
     } else {
      $$124466$i = $644;
     }
    }
    if ((label|0) == 151) {
     $646 = ((($$124466$i)) + 12|0);
     $647 = HEAP32[$646>>2]|0;
     $648 = $647 & 8;
     $649 = ($648|0)==(0);
     if ($649) {
      HEAP32[$$124466$i>>2] = $$748$i;
      $650 = ((($$124466$i)) + 4|0);
      $651 = HEAP32[$650>>2]|0;
      $652 = (($651) + ($$723947$i))|0;
      HEAP32[$650>>2] = $652;
      $653 = ((($$748$i)) + 8|0);
      $654 = $653;
      $655 = $654 & 7;
      $656 = ($655|0)==(0);
      $657 = (0 - ($654))|0;
      $658 = $657 & 7;
      $659 = $656 ? 0 : $658;
      $660 = (($$748$i) + ($659)|0);
      $661 = ((($640)) + 8|0);
      $662 = $661;
      $663 = $662 & 7;
      $664 = ($663|0)==(0);
      $665 = (0 - ($662))|0;
      $666 = $665 & 7;
      $667 = $664 ? 0 : $666;
      $668 = (($640) + ($667)|0);
      $669 = $668;
      $670 = $660;
      $671 = (($669) - ($670))|0;
      $672 = (($660) + ($$0192)|0);
      $673 = (($671) - ($$0192))|0;
      $674 = $$0192 | 3;
      $675 = ((($660)) + 4|0);
      HEAP32[$675>>2] = $674;
      $676 = ($586|0)==($668|0);
      do {
       if ($676) {
        $677 = HEAP32[(10580)>>2]|0;
        $678 = (($677) + ($673))|0;
        HEAP32[(10580)>>2] = $678;
        HEAP32[(10592)>>2] = $672;
        $679 = $678 | 1;
        $680 = ((($672)) + 4|0);
        HEAP32[$680>>2] = $679;
       } else {
        $681 = HEAP32[(10588)>>2]|0;
        $682 = ($681|0)==($668|0);
        if ($682) {
         $683 = HEAP32[(10576)>>2]|0;
         $684 = (($683) + ($673))|0;
         HEAP32[(10576)>>2] = $684;
         HEAP32[(10588)>>2] = $672;
         $685 = $684 | 1;
         $686 = ((($672)) + 4|0);
         HEAP32[$686>>2] = $685;
         $687 = (($672) + ($684)|0);
         HEAP32[$687>>2] = $684;
         break;
        }
        $688 = ((($668)) + 4|0);
        $689 = HEAP32[$688>>2]|0;
        $690 = $689 & 3;
        $691 = ($690|0)==(1);
        if ($691) {
         $692 = $689 & -8;
         $693 = $689 >>> 3;
         $694 = ($689>>>0)<(256);
         L234: do {
          if ($694) {
           $695 = ((($668)) + 8|0);
           $696 = HEAP32[$695>>2]|0;
           $697 = ((($668)) + 12|0);
           $698 = HEAP32[$697>>2]|0;
           $699 = ($698|0)==($696|0);
           if ($699) {
            $700 = 1 << $693;
            $701 = $700 ^ -1;
            $702 = HEAP32[2642]|0;
            $703 = $702 & $701;
            HEAP32[2642] = $703;
            break;
           } else {
            $704 = ((($696)) + 12|0);
            HEAP32[$704>>2] = $698;
            $705 = ((($698)) + 8|0);
            HEAP32[$705>>2] = $696;
            break;
           }
          } else {
           $706 = ((($668)) + 24|0);
           $707 = HEAP32[$706>>2]|0;
           $708 = ((($668)) + 12|0);
           $709 = HEAP32[$708>>2]|0;
           $710 = ($709|0)==($668|0);
           do {
            if ($710) {
             $715 = ((($668)) + 16|0);
             $716 = ((($715)) + 4|0);
             $717 = HEAP32[$716>>2]|0;
             $718 = ($717|0)==(0|0);
             if ($718) {
              $719 = HEAP32[$715>>2]|0;
              $720 = ($719|0)==(0|0);
              if ($720) {
               $$3$i$i = 0;
               break;
              } else {
               $$1264$i$i = $719;$$1266$i$i = $715;
              }
             } else {
              $$1264$i$i = $717;$$1266$i$i = $716;
             }
             while(1) {
              $721 = ((($$1264$i$i)) + 20|0);
              $722 = HEAP32[$721>>2]|0;
              $723 = ($722|0)==(0|0);
              if (!($723)) {
               $$1264$i$i = $722;$$1266$i$i = $721;
               continue;
              }
              $724 = ((($$1264$i$i)) + 16|0);
              $725 = HEAP32[$724>>2]|0;
              $726 = ($725|0)==(0|0);
              if ($726) {
               break;
              } else {
               $$1264$i$i = $725;$$1266$i$i = $724;
              }
             }
             HEAP32[$$1266$i$i>>2] = 0;
             $$3$i$i = $$1264$i$i;
            } else {
             $711 = ((($668)) + 8|0);
             $712 = HEAP32[$711>>2]|0;
             $713 = ((($712)) + 12|0);
             HEAP32[$713>>2] = $709;
             $714 = ((($709)) + 8|0);
             HEAP32[$714>>2] = $712;
             $$3$i$i = $709;
            }
           } while(0);
           $727 = ($707|0)==(0|0);
           if ($727) {
            break;
           }
           $728 = ((($668)) + 28|0);
           $729 = HEAP32[$728>>2]|0;
           $730 = (10872 + ($729<<2)|0);
           $731 = HEAP32[$730>>2]|0;
           $732 = ($731|0)==($668|0);
           do {
            if ($732) {
             HEAP32[$730>>2] = $$3$i$i;
             $cond$i$i = ($$3$i$i|0)==(0|0);
             if (!($cond$i$i)) {
              break;
             }
             $733 = 1 << $729;
             $734 = $733 ^ -1;
             $735 = HEAP32[(10572)>>2]|0;
             $736 = $735 & $734;
             HEAP32[(10572)>>2] = $736;
             break L234;
            } else {
             $737 = ((($707)) + 16|0);
             $738 = HEAP32[$737>>2]|0;
             $739 = ($738|0)!=($668|0);
             $$sink1$i$i = $739&1;
             $740 = (((($707)) + 16|0) + ($$sink1$i$i<<2)|0);
             HEAP32[$740>>2] = $$3$i$i;
             $741 = ($$3$i$i|0)==(0|0);
             if ($741) {
              break L234;
             }
            }
           } while(0);
           $742 = ((($$3$i$i)) + 24|0);
           HEAP32[$742>>2] = $707;
           $743 = ((($668)) + 16|0);
           $744 = HEAP32[$743>>2]|0;
           $745 = ($744|0)==(0|0);
           if (!($745)) {
            $746 = ((($$3$i$i)) + 16|0);
            HEAP32[$746>>2] = $744;
            $747 = ((($744)) + 24|0);
            HEAP32[$747>>2] = $$3$i$i;
           }
           $748 = ((($743)) + 4|0);
           $749 = HEAP32[$748>>2]|0;
           $750 = ($749|0)==(0|0);
           if ($750) {
            break;
           }
           $751 = ((($$3$i$i)) + 20|0);
           HEAP32[$751>>2] = $749;
           $752 = ((($749)) + 24|0);
           HEAP32[$752>>2] = $$3$i$i;
          }
         } while(0);
         $753 = (($668) + ($692)|0);
         $754 = (($692) + ($673))|0;
         $$0$i$i = $753;$$0260$i$i = $754;
        } else {
         $$0$i$i = $668;$$0260$i$i = $673;
        }
        $755 = ((($$0$i$i)) + 4|0);
        $756 = HEAP32[$755>>2]|0;
        $757 = $756 & -2;
        HEAP32[$755>>2] = $757;
        $758 = $$0260$i$i | 1;
        $759 = ((($672)) + 4|0);
        HEAP32[$759>>2] = $758;
        $760 = (($672) + ($$0260$i$i)|0);
        HEAP32[$760>>2] = $$0260$i$i;
        $761 = $$0260$i$i >>> 3;
        $762 = ($$0260$i$i>>>0)<(256);
        if ($762) {
         $763 = $761 << 1;
         $764 = (10608 + ($763<<2)|0);
         $765 = HEAP32[2642]|0;
         $766 = 1 << $761;
         $767 = $765 & $766;
         $768 = ($767|0)==(0);
         if ($768) {
          $769 = $765 | $766;
          HEAP32[2642] = $769;
          $$pre$i17$i = ((($764)) + 8|0);
          $$0268$i$i = $764;$$pre$phi$i18$iZ2D = $$pre$i17$i;
         } else {
          $770 = ((($764)) + 8|0);
          $771 = HEAP32[$770>>2]|0;
          $$0268$i$i = $771;$$pre$phi$i18$iZ2D = $770;
         }
         HEAP32[$$pre$phi$i18$iZ2D>>2] = $672;
         $772 = ((($$0268$i$i)) + 12|0);
         HEAP32[$772>>2] = $672;
         $773 = ((($672)) + 8|0);
         HEAP32[$773>>2] = $$0268$i$i;
         $774 = ((($672)) + 12|0);
         HEAP32[$774>>2] = $764;
         break;
        }
        $775 = $$0260$i$i >>> 8;
        $776 = ($775|0)==(0);
        do {
         if ($776) {
          $$0269$i$i = 0;
         } else {
          $777 = ($$0260$i$i>>>0)>(16777215);
          if ($777) {
           $$0269$i$i = 31;
           break;
          }
          $778 = (($775) + 1048320)|0;
          $779 = $778 >>> 16;
          $780 = $779 & 8;
          $781 = $775 << $780;
          $782 = (($781) + 520192)|0;
          $783 = $782 >>> 16;
          $784 = $783 & 4;
          $785 = $784 | $780;
          $786 = $781 << $784;
          $787 = (($786) + 245760)|0;
          $788 = $787 >>> 16;
          $789 = $788 & 2;
          $790 = $785 | $789;
          $791 = (14 - ($790))|0;
          $792 = $786 << $789;
          $793 = $792 >>> 15;
          $794 = (($791) + ($793))|0;
          $795 = $794 << 1;
          $796 = (($794) + 7)|0;
          $797 = $$0260$i$i >>> $796;
          $798 = $797 & 1;
          $799 = $798 | $795;
          $$0269$i$i = $799;
         }
        } while(0);
        $800 = (10872 + ($$0269$i$i<<2)|0);
        $801 = ((($672)) + 28|0);
        HEAP32[$801>>2] = $$0269$i$i;
        $802 = ((($672)) + 16|0);
        $803 = ((($802)) + 4|0);
        HEAP32[$803>>2] = 0;
        HEAP32[$802>>2] = 0;
        $804 = HEAP32[(10572)>>2]|0;
        $805 = 1 << $$0269$i$i;
        $806 = $804 & $805;
        $807 = ($806|0)==(0);
        if ($807) {
         $808 = $804 | $805;
         HEAP32[(10572)>>2] = $808;
         HEAP32[$800>>2] = $672;
         $809 = ((($672)) + 24|0);
         HEAP32[$809>>2] = $800;
         $810 = ((($672)) + 12|0);
         HEAP32[$810>>2] = $672;
         $811 = ((($672)) + 8|0);
         HEAP32[$811>>2] = $672;
         break;
        }
        $812 = HEAP32[$800>>2]|0;
        $813 = ($$0269$i$i|0)==(31);
        $814 = $$0269$i$i >>> 1;
        $815 = (25 - ($814))|0;
        $816 = $813 ? 0 : $815;
        $817 = $$0260$i$i << $816;
        $$0261$i$i = $817;$$0262$i$i = $812;
        while(1) {
         $818 = ((($$0262$i$i)) + 4|0);
         $819 = HEAP32[$818>>2]|0;
         $820 = $819 & -8;
         $821 = ($820|0)==($$0260$i$i|0);
         if ($821) {
          label = 192;
          break;
         }
         $822 = $$0261$i$i >>> 31;
         $823 = (((($$0262$i$i)) + 16|0) + ($822<<2)|0);
         $824 = $$0261$i$i << 1;
         $825 = HEAP32[$823>>2]|0;
         $826 = ($825|0)==(0|0);
         if ($826) {
          label = 191;
          break;
         } else {
          $$0261$i$i = $824;$$0262$i$i = $825;
         }
        }
        if ((label|0) == 191) {
         HEAP32[$823>>2] = $672;
         $827 = ((($672)) + 24|0);
         HEAP32[$827>>2] = $$0262$i$i;
         $828 = ((($672)) + 12|0);
         HEAP32[$828>>2] = $672;
         $829 = ((($672)) + 8|0);
         HEAP32[$829>>2] = $672;
         break;
        }
        else if ((label|0) == 192) {
         $830 = ((($$0262$i$i)) + 8|0);
         $831 = HEAP32[$830>>2]|0;
         $832 = ((($831)) + 12|0);
         HEAP32[$832>>2] = $672;
         HEAP32[$830>>2] = $672;
         $833 = ((($672)) + 8|0);
         HEAP32[$833>>2] = $831;
         $834 = ((($672)) + 12|0);
         HEAP32[$834>>2] = $$0262$i$i;
         $835 = ((($672)) + 24|0);
         HEAP32[$835>>2] = 0;
         break;
        }
       }
      } while(0);
      $960 = ((($660)) + 8|0);
      $$0 = $960;
      STACKTOP = sp;return ($$0|0);
     } else {
      $$0$i$i$i = (11016);
     }
    }
    while(1) {
     $836 = HEAP32[$$0$i$i$i>>2]|0;
     $837 = ($836>>>0)>($586>>>0);
     if (!($837)) {
      $838 = ((($$0$i$i$i)) + 4|0);
      $839 = HEAP32[$838>>2]|0;
      $840 = (($836) + ($839)|0);
      $841 = ($840>>>0)>($586>>>0);
      if ($841) {
       break;
      }
     }
     $842 = ((($$0$i$i$i)) + 8|0);
     $843 = HEAP32[$842>>2]|0;
     $$0$i$i$i = $843;
    }
    $844 = ((($840)) + -47|0);
    $845 = ((($844)) + 8|0);
    $846 = $845;
    $847 = $846 & 7;
    $848 = ($847|0)==(0);
    $849 = (0 - ($846))|0;
    $850 = $849 & 7;
    $851 = $848 ? 0 : $850;
    $852 = (($844) + ($851)|0);
    $853 = ((($586)) + 16|0);
    $854 = ($852>>>0)<($853>>>0);
    $855 = $854 ? $586 : $852;
    $856 = ((($855)) + 8|0);
    $857 = ((($855)) + 24|0);
    $858 = (($$723947$i) + -40)|0;
    $859 = ((($$748$i)) + 8|0);
    $860 = $859;
    $861 = $860 & 7;
    $862 = ($861|0)==(0);
    $863 = (0 - ($860))|0;
    $864 = $863 & 7;
    $865 = $862 ? 0 : $864;
    $866 = (($$748$i) + ($865)|0);
    $867 = (($858) - ($865))|0;
    HEAP32[(10592)>>2] = $866;
    HEAP32[(10580)>>2] = $867;
    $868 = $867 | 1;
    $869 = ((($866)) + 4|0);
    HEAP32[$869>>2] = $868;
    $870 = (($$748$i) + ($858)|0);
    $871 = ((($870)) + 4|0);
    HEAP32[$871>>2] = 40;
    $872 = HEAP32[(11056)>>2]|0;
    HEAP32[(10596)>>2] = $872;
    $873 = ((($855)) + 4|0);
    HEAP32[$873>>2] = 27;
    ;HEAP32[$856>>2]=HEAP32[(11016)>>2]|0;HEAP32[$856+4>>2]=HEAP32[(11016)+4>>2]|0;HEAP32[$856+8>>2]=HEAP32[(11016)+8>>2]|0;HEAP32[$856+12>>2]=HEAP32[(11016)+12>>2]|0;
    HEAP32[(11016)>>2] = $$748$i;
    HEAP32[(11020)>>2] = $$723947$i;
    HEAP32[(11028)>>2] = 0;
    HEAP32[(11024)>>2] = $856;
    $875 = $857;
    while(1) {
     $874 = ((($875)) + 4|0);
     HEAP32[$874>>2] = 7;
     $876 = ((($875)) + 8|0);
     $877 = ($876>>>0)<($840>>>0);
     if ($877) {
      $875 = $874;
     } else {
      break;
     }
    }
    $878 = ($855|0)==($586|0);
    if (!($878)) {
     $879 = $855;
     $880 = $586;
     $881 = (($879) - ($880))|0;
     $882 = HEAP32[$873>>2]|0;
     $883 = $882 & -2;
     HEAP32[$873>>2] = $883;
     $884 = $881 | 1;
     $885 = ((($586)) + 4|0);
     HEAP32[$885>>2] = $884;
     HEAP32[$855>>2] = $881;
     $886 = $881 >>> 3;
     $887 = ($881>>>0)<(256);
     if ($887) {
      $888 = $886 << 1;
      $889 = (10608 + ($888<<2)|0);
      $890 = HEAP32[2642]|0;
      $891 = 1 << $886;
      $892 = $890 & $891;
      $893 = ($892|0)==(0);
      if ($893) {
       $894 = $890 | $891;
       HEAP32[2642] = $894;
       $$pre$i$i = ((($889)) + 8|0);
       $$0206$i$i = $889;$$pre$phi$i$iZ2D = $$pre$i$i;
      } else {
       $895 = ((($889)) + 8|0);
       $896 = HEAP32[$895>>2]|0;
       $$0206$i$i = $896;$$pre$phi$i$iZ2D = $895;
      }
      HEAP32[$$pre$phi$i$iZ2D>>2] = $586;
      $897 = ((($$0206$i$i)) + 12|0);
      HEAP32[$897>>2] = $586;
      $898 = ((($586)) + 8|0);
      HEAP32[$898>>2] = $$0206$i$i;
      $899 = ((($586)) + 12|0);
      HEAP32[$899>>2] = $889;
      break;
     }
     $900 = $881 >>> 8;
     $901 = ($900|0)==(0);
     if ($901) {
      $$0207$i$i = 0;
     } else {
      $902 = ($881>>>0)>(16777215);
      if ($902) {
       $$0207$i$i = 31;
      } else {
       $903 = (($900) + 1048320)|0;
       $904 = $903 >>> 16;
       $905 = $904 & 8;
       $906 = $900 << $905;
       $907 = (($906) + 520192)|0;
       $908 = $907 >>> 16;
       $909 = $908 & 4;
       $910 = $909 | $905;
       $911 = $906 << $909;
       $912 = (($911) + 245760)|0;
       $913 = $912 >>> 16;
       $914 = $913 & 2;
       $915 = $910 | $914;
       $916 = (14 - ($915))|0;
       $917 = $911 << $914;
       $918 = $917 >>> 15;
       $919 = (($916) + ($918))|0;
       $920 = $919 << 1;
       $921 = (($919) + 7)|0;
       $922 = $881 >>> $921;
       $923 = $922 & 1;
       $924 = $923 | $920;
       $$0207$i$i = $924;
      }
     }
     $925 = (10872 + ($$0207$i$i<<2)|0);
     $926 = ((($586)) + 28|0);
     HEAP32[$926>>2] = $$0207$i$i;
     $927 = ((($586)) + 20|0);
     HEAP32[$927>>2] = 0;
     HEAP32[$853>>2] = 0;
     $928 = HEAP32[(10572)>>2]|0;
     $929 = 1 << $$0207$i$i;
     $930 = $928 & $929;
     $931 = ($930|0)==(0);
     if ($931) {
      $932 = $928 | $929;
      HEAP32[(10572)>>2] = $932;
      HEAP32[$925>>2] = $586;
      $933 = ((($586)) + 24|0);
      HEAP32[$933>>2] = $925;
      $934 = ((($586)) + 12|0);
      HEAP32[$934>>2] = $586;
      $935 = ((($586)) + 8|0);
      HEAP32[$935>>2] = $586;
      break;
     }
     $936 = HEAP32[$925>>2]|0;
     $937 = ($$0207$i$i|0)==(31);
     $938 = $$0207$i$i >>> 1;
     $939 = (25 - ($938))|0;
     $940 = $937 ? 0 : $939;
     $941 = $881 << $940;
     $$0201$i$i = $941;$$0202$i$i = $936;
     while(1) {
      $942 = ((($$0202$i$i)) + 4|0);
      $943 = HEAP32[$942>>2]|0;
      $944 = $943 & -8;
      $945 = ($944|0)==($881|0);
      if ($945) {
       label = 213;
       break;
      }
      $946 = $$0201$i$i >>> 31;
      $947 = (((($$0202$i$i)) + 16|0) + ($946<<2)|0);
      $948 = $$0201$i$i << 1;
      $949 = HEAP32[$947>>2]|0;
      $950 = ($949|0)==(0|0);
      if ($950) {
       label = 212;
       break;
      } else {
       $$0201$i$i = $948;$$0202$i$i = $949;
      }
     }
     if ((label|0) == 212) {
      HEAP32[$947>>2] = $586;
      $951 = ((($586)) + 24|0);
      HEAP32[$951>>2] = $$0202$i$i;
      $952 = ((($586)) + 12|0);
      HEAP32[$952>>2] = $586;
      $953 = ((($586)) + 8|0);
      HEAP32[$953>>2] = $586;
      break;
     }
     else if ((label|0) == 213) {
      $954 = ((($$0202$i$i)) + 8|0);
      $955 = HEAP32[$954>>2]|0;
      $956 = ((($955)) + 12|0);
      HEAP32[$956>>2] = $586;
      HEAP32[$954>>2] = $586;
      $957 = ((($586)) + 8|0);
      HEAP32[$957>>2] = $955;
      $958 = ((($586)) + 12|0);
      HEAP32[$958>>2] = $$0202$i$i;
      $959 = ((($586)) + 24|0);
      HEAP32[$959>>2] = 0;
      break;
     }
    }
   }
  } while(0);
  $961 = HEAP32[(10580)>>2]|0;
  $962 = ($961>>>0)>($$0192>>>0);
  if ($962) {
   $963 = (($961) - ($$0192))|0;
   HEAP32[(10580)>>2] = $963;
   $964 = HEAP32[(10592)>>2]|0;
   $965 = (($964) + ($$0192)|0);
   HEAP32[(10592)>>2] = $965;
   $966 = $963 | 1;
   $967 = ((($965)) + 4|0);
   HEAP32[$967>>2] = $966;
   $968 = $$0192 | 3;
   $969 = ((($964)) + 4|0);
   HEAP32[$969>>2] = $968;
   $970 = ((($964)) + 8|0);
   $$0 = $970;
   STACKTOP = sp;return ($$0|0);
  }
 }
 $971 = (___errno_location()|0);
 HEAP32[$971>>2] = 12;
 $$0 = 0;
 STACKTOP = sp;return ($$0|0);
}
function _free($0) {
 $0 = $0|0;
 var $$0195$i = 0, $$0195$in$i = 0, $$0348 = 0, $$0349 = 0, $$0361 = 0, $$0368 = 0, $$1 = 0, $$1347 = 0, $$1352 = 0, $$1355 = 0, $$1363 = 0, $$1367 = 0, $$2 = 0, $$3 = 0, $$3365 = 0, $$pre = 0, $$pre$phiZ2D = 0, $$sink3 = 0, $$sink5 = 0, $1 = 0;
 var $10 = 0, $100 = 0, $101 = 0, $102 = 0, $103 = 0, $104 = 0, $105 = 0, $106 = 0, $107 = 0, $108 = 0, $109 = 0, $11 = 0, $110 = 0, $111 = 0, $112 = 0, $113 = 0, $114 = 0, $115 = 0, $116 = 0, $117 = 0;
 var $118 = 0, $119 = 0, $12 = 0, $120 = 0, $121 = 0, $122 = 0, $123 = 0, $124 = 0, $125 = 0, $126 = 0, $127 = 0, $128 = 0, $129 = 0, $13 = 0, $130 = 0, $131 = 0, $132 = 0, $133 = 0, $134 = 0, $135 = 0;
 var $136 = 0, $137 = 0, $138 = 0, $139 = 0, $14 = 0, $140 = 0, $141 = 0, $142 = 0, $143 = 0, $144 = 0, $145 = 0, $146 = 0, $147 = 0, $148 = 0, $149 = 0, $15 = 0, $150 = 0, $151 = 0, $152 = 0, $153 = 0;
 var $154 = 0, $155 = 0, $156 = 0, $157 = 0, $158 = 0, $159 = 0, $16 = 0, $160 = 0, $161 = 0, $162 = 0, $163 = 0, $164 = 0, $165 = 0, $166 = 0, $167 = 0, $168 = 0, $169 = 0, $17 = 0, $170 = 0, $171 = 0;
 var $172 = 0, $173 = 0, $174 = 0, $175 = 0, $176 = 0, $177 = 0, $178 = 0, $179 = 0, $18 = 0, $180 = 0, $181 = 0, $182 = 0, $183 = 0, $184 = 0, $185 = 0, $186 = 0, $187 = 0, $188 = 0, $189 = 0, $19 = 0;
 var $190 = 0, $191 = 0, $192 = 0, $193 = 0, $194 = 0, $195 = 0, $196 = 0, $197 = 0, $198 = 0, $199 = 0, $2 = 0, $20 = 0, $200 = 0, $201 = 0, $202 = 0, $203 = 0, $204 = 0, $205 = 0, $206 = 0, $207 = 0;
 var $208 = 0, $209 = 0, $21 = 0, $210 = 0, $211 = 0, $212 = 0, $213 = 0, $214 = 0, $215 = 0, $216 = 0, $217 = 0, $218 = 0, $219 = 0, $22 = 0, $220 = 0, $221 = 0, $222 = 0, $223 = 0, $224 = 0, $225 = 0;
 var $226 = 0, $227 = 0, $228 = 0, $229 = 0, $23 = 0, $230 = 0, $231 = 0, $232 = 0, $233 = 0, $234 = 0, $235 = 0, $236 = 0, $237 = 0, $238 = 0, $239 = 0, $24 = 0, $240 = 0, $241 = 0, $242 = 0, $243 = 0;
 var $244 = 0, $245 = 0, $246 = 0, $247 = 0, $248 = 0, $249 = 0, $25 = 0, $250 = 0, $251 = 0, $252 = 0, $253 = 0, $254 = 0, $255 = 0, $256 = 0, $257 = 0, $258 = 0, $259 = 0, $26 = 0, $260 = 0, $27 = 0;
 var $28 = 0, $29 = 0, $3 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $4 = 0, $40 = 0, $41 = 0, $42 = 0, $43 = 0, $44 = 0, $45 = 0;
 var $46 = 0, $47 = 0, $48 = 0, $49 = 0, $5 = 0, $50 = 0, $51 = 0, $52 = 0, $53 = 0, $54 = 0, $55 = 0, $56 = 0, $57 = 0, $58 = 0, $59 = 0, $6 = 0, $60 = 0, $61 = 0, $62 = 0, $63 = 0;
 var $64 = 0, $65 = 0, $66 = 0, $67 = 0, $68 = 0, $69 = 0, $7 = 0, $70 = 0, $71 = 0, $72 = 0, $73 = 0, $74 = 0, $75 = 0, $76 = 0, $77 = 0, $78 = 0, $79 = 0, $8 = 0, $80 = 0, $81 = 0;
 var $82 = 0, $83 = 0, $84 = 0, $85 = 0, $86 = 0, $87 = 0, $88 = 0, $89 = 0, $9 = 0, $90 = 0, $91 = 0, $92 = 0, $93 = 0, $94 = 0, $95 = 0, $96 = 0, $97 = 0, $98 = 0, $99 = 0, $cond373 = 0;
 var $cond374 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $1 = ($0|0)==(0|0);
 if ($1) {
  return;
 }
 $2 = ((($0)) + -8|0);
 $3 = HEAP32[(10584)>>2]|0;
 $4 = ((($0)) + -4|0);
 $5 = HEAP32[$4>>2]|0;
 $6 = $5 & -8;
 $7 = (($2) + ($6)|0);
 $8 = $5 & 1;
 $9 = ($8|0)==(0);
 do {
  if ($9) {
   $10 = HEAP32[$2>>2]|0;
   $11 = $5 & 3;
   $12 = ($11|0)==(0);
   if ($12) {
    return;
   }
   $13 = (0 - ($10))|0;
   $14 = (($2) + ($13)|0);
   $15 = (($10) + ($6))|0;
   $16 = ($14>>>0)<($3>>>0);
   if ($16) {
    return;
   }
   $17 = HEAP32[(10588)>>2]|0;
   $18 = ($17|0)==($14|0);
   if ($18) {
    $79 = ((($7)) + 4|0);
    $80 = HEAP32[$79>>2]|0;
    $81 = $80 & 3;
    $82 = ($81|0)==(3);
    if (!($82)) {
     $$1 = $14;$$1347 = $15;$87 = $14;
     break;
    }
    HEAP32[(10576)>>2] = $15;
    $83 = $80 & -2;
    HEAP32[$79>>2] = $83;
    $84 = $15 | 1;
    $85 = ((($14)) + 4|0);
    HEAP32[$85>>2] = $84;
    $86 = (($14) + ($15)|0);
    HEAP32[$86>>2] = $15;
    return;
   }
   $19 = $10 >>> 3;
   $20 = ($10>>>0)<(256);
   if ($20) {
    $21 = ((($14)) + 8|0);
    $22 = HEAP32[$21>>2]|0;
    $23 = ((($14)) + 12|0);
    $24 = HEAP32[$23>>2]|0;
    $25 = ($24|0)==($22|0);
    if ($25) {
     $26 = 1 << $19;
     $27 = $26 ^ -1;
     $28 = HEAP32[2642]|0;
     $29 = $28 & $27;
     HEAP32[2642] = $29;
     $$1 = $14;$$1347 = $15;$87 = $14;
     break;
    } else {
     $30 = ((($22)) + 12|0);
     HEAP32[$30>>2] = $24;
     $31 = ((($24)) + 8|0);
     HEAP32[$31>>2] = $22;
     $$1 = $14;$$1347 = $15;$87 = $14;
     break;
    }
   }
   $32 = ((($14)) + 24|0);
   $33 = HEAP32[$32>>2]|0;
   $34 = ((($14)) + 12|0);
   $35 = HEAP32[$34>>2]|0;
   $36 = ($35|0)==($14|0);
   do {
    if ($36) {
     $41 = ((($14)) + 16|0);
     $42 = ((($41)) + 4|0);
     $43 = HEAP32[$42>>2]|0;
     $44 = ($43|0)==(0|0);
     if ($44) {
      $45 = HEAP32[$41>>2]|0;
      $46 = ($45|0)==(0|0);
      if ($46) {
       $$3 = 0;
       break;
      } else {
       $$1352 = $45;$$1355 = $41;
      }
     } else {
      $$1352 = $43;$$1355 = $42;
     }
     while(1) {
      $47 = ((($$1352)) + 20|0);
      $48 = HEAP32[$47>>2]|0;
      $49 = ($48|0)==(0|0);
      if (!($49)) {
       $$1352 = $48;$$1355 = $47;
       continue;
      }
      $50 = ((($$1352)) + 16|0);
      $51 = HEAP32[$50>>2]|0;
      $52 = ($51|0)==(0|0);
      if ($52) {
       break;
      } else {
       $$1352 = $51;$$1355 = $50;
      }
     }
     HEAP32[$$1355>>2] = 0;
     $$3 = $$1352;
    } else {
     $37 = ((($14)) + 8|0);
     $38 = HEAP32[$37>>2]|0;
     $39 = ((($38)) + 12|0);
     HEAP32[$39>>2] = $35;
     $40 = ((($35)) + 8|0);
     HEAP32[$40>>2] = $38;
     $$3 = $35;
    }
   } while(0);
   $53 = ($33|0)==(0|0);
   if ($53) {
    $$1 = $14;$$1347 = $15;$87 = $14;
   } else {
    $54 = ((($14)) + 28|0);
    $55 = HEAP32[$54>>2]|0;
    $56 = (10872 + ($55<<2)|0);
    $57 = HEAP32[$56>>2]|0;
    $58 = ($57|0)==($14|0);
    if ($58) {
     HEAP32[$56>>2] = $$3;
     $cond373 = ($$3|0)==(0|0);
     if ($cond373) {
      $59 = 1 << $55;
      $60 = $59 ^ -1;
      $61 = HEAP32[(10572)>>2]|0;
      $62 = $61 & $60;
      HEAP32[(10572)>>2] = $62;
      $$1 = $14;$$1347 = $15;$87 = $14;
      break;
     }
    } else {
     $63 = ((($33)) + 16|0);
     $64 = HEAP32[$63>>2]|0;
     $65 = ($64|0)!=($14|0);
     $$sink3 = $65&1;
     $66 = (((($33)) + 16|0) + ($$sink3<<2)|0);
     HEAP32[$66>>2] = $$3;
     $67 = ($$3|0)==(0|0);
     if ($67) {
      $$1 = $14;$$1347 = $15;$87 = $14;
      break;
     }
    }
    $68 = ((($$3)) + 24|0);
    HEAP32[$68>>2] = $33;
    $69 = ((($14)) + 16|0);
    $70 = HEAP32[$69>>2]|0;
    $71 = ($70|0)==(0|0);
    if (!($71)) {
     $72 = ((($$3)) + 16|0);
     HEAP32[$72>>2] = $70;
     $73 = ((($70)) + 24|0);
     HEAP32[$73>>2] = $$3;
    }
    $74 = ((($69)) + 4|0);
    $75 = HEAP32[$74>>2]|0;
    $76 = ($75|0)==(0|0);
    if ($76) {
     $$1 = $14;$$1347 = $15;$87 = $14;
    } else {
     $77 = ((($$3)) + 20|0);
     HEAP32[$77>>2] = $75;
     $78 = ((($75)) + 24|0);
     HEAP32[$78>>2] = $$3;
     $$1 = $14;$$1347 = $15;$87 = $14;
    }
   }
  } else {
   $$1 = $2;$$1347 = $6;$87 = $2;
  }
 } while(0);
 $88 = ($87>>>0)<($7>>>0);
 if (!($88)) {
  return;
 }
 $89 = ((($7)) + 4|0);
 $90 = HEAP32[$89>>2]|0;
 $91 = $90 & 1;
 $92 = ($91|0)==(0);
 if ($92) {
  return;
 }
 $93 = $90 & 2;
 $94 = ($93|0)==(0);
 if ($94) {
  $95 = HEAP32[(10592)>>2]|0;
  $96 = ($95|0)==($7|0);
  if ($96) {
   $97 = HEAP32[(10580)>>2]|0;
   $98 = (($97) + ($$1347))|0;
   HEAP32[(10580)>>2] = $98;
   HEAP32[(10592)>>2] = $$1;
   $99 = $98 | 1;
   $100 = ((($$1)) + 4|0);
   HEAP32[$100>>2] = $99;
   $101 = HEAP32[(10588)>>2]|0;
   $102 = ($$1|0)==($101|0);
   if (!($102)) {
    return;
   }
   HEAP32[(10588)>>2] = 0;
   HEAP32[(10576)>>2] = 0;
   return;
  }
  $103 = HEAP32[(10588)>>2]|0;
  $104 = ($103|0)==($7|0);
  if ($104) {
   $105 = HEAP32[(10576)>>2]|0;
   $106 = (($105) + ($$1347))|0;
   HEAP32[(10576)>>2] = $106;
   HEAP32[(10588)>>2] = $87;
   $107 = $106 | 1;
   $108 = ((($$1)) + 4|0);
   HEAP32[$108>>2] = $107;
   $109 = (($87) + ($106)|0);
   HEAP32[$109>>2] = $106;
   return;
  }
  $110 = $90 & -8;
  $111 = (($110) + ($$1347))|0;
  $112 = $90 >>> 3;
  $113 = ($90>>>0)<(256);
  do {
   if ($113) {
    $114 = ((($7)) + 8|0);
    $115 = HEAP32[$114>>2]|0;
    $116 = ((($7)) + 12|0);
    $117 = HEAP32[$116>>2]|0;
    $118 = ($117|0)==($115|0);
    if ($118) {
     $119 = 1 << $112;
     $120 = $119 ^ -1;
     $121 = HEAP32[2642]|0;
     $122 = $121 & $120;
     HEAP32[2642] = $122;
     break;
    } else {
     $123 = ((($115)) + 12|0);
     HEAP32[$123>>2] = $117;
     $124 = ((($117)) + 8|0);
     HEAP32[$124>>2] = $115;
     break;
    }
   } else {
    $125 = ((($7)) + 24|0);
    $126 = HEAP32[$125>>2]|0;
    $127 = ((($7)) + 12|0);
    $128 = HEAP32[$127>>2]|0;
    $129 = ($128|0)==($7|0);
    do {
     if ($129) {
      $134 = ((($7)) + 16|0);
      $135 = ((($134)) + 4|0);
      $136 = HEAP32[$135>>2]|0;
      $137 = ($136|0)==(0|0);
      if ($137) {
       $138 = HEAP32[$134>>2]|0;
       $139 = ($138|0)==(0|0);
       if ($139) {
        $$3365 = 0;
        break;
       } else {
        $$1363 = $138;$$1367 = $134;
       }
      } else {
       $$1363 = $136;$$1367 = $135;
      }
      while(1) {
       $140 = ((($$1363)) + 20|0);
       $141 = HEAP32[$140>>2]|0;
       $142 = ($141|0)==(0|0);
       if (!($142)) {
        $$1363 = $141;$$1367 = $140;
        continue;
       }
       $143 = ((($$1363)) + 16|0);
       $144 = HEAP32[$143>>2]|0;
       $145 = ($144|0)==(0|0);
       if ($145) {
        break;
       } else {
        $$1363 = $144;$$1367 = $143;
       }
      }
      HEAP32[$$1367>>2] = 0;
      $$3365 = $$1363;
     } else {
      $130 = ((($7)) + 8|0);
      $131 = HEAP32[$130>>2]|0;
      $132 = ((($131)) + 12|0);
      HEAP32[$132>>2] = $128;
      $133 = ((($128)) + 8|0);
      HEAP32[$133>>2] = $131;
      $$3365 = $128;
     }
    } while(0);
    $146 = ($126|0)==(0|0);
    if (!($146)) {
     $147 = ((($7)) + 28|0);
     $148 = HEAP32[$147>>2]|0;
     $149 = (10872 + ($148<<2)|0);
     $150 = HEAP32[$149>>2]|0;
     $151 = ($150|0)==($7|0);
     if ($151) {
      HEAP32[$149>>2] = $$3365;
      $cond374 = ($$3365|0)==(0|0);
      if ($cond374) {
       $152 = 1 << $148;
       $153 = $152 ^ -1;
       $154 = HEAP32[(10572)>>2]|0;
       $155 = $154 & $153;
       HEAP32[(10572)>>2] = $155;
       break;
      }
     } else {
      $156 = ((($126)) + 16|0);
      $157 = HEAP32[$156>>2]|0;
      $158 = ($157|0)!=($7|0);
      $$sink5 = $158&1;
      $159 = (((($126)) + 16|0) + ($$sink5<<2)|0);
      HEAP32[$159>>2] = $$3365;
      $160 = ($$3365|0)==(0|0);
      if ($160) {
       break;
      }
     }
     $161 = ((($$3365)) + 24|0);
     HEAP32[$161>>2] = $126;
     $162 = ((($7)) + 16|0);
     $163 = HEAP32[$162>>2]|0;
     $164 = ($163|0)==(0|0);
     if (!($164)) {
      $165 = ((($$3365)) + 16|0);
      HEAP32[$165>>2] = $163;
      $166 = ((($163)) + 24|0);
      HEAP32[$166>>2] = $$3365;
     }
     $167 = ((($162)) + 4|0);
     $168 = HEAP32[$167>>2]|0;
     $169 = ($168|0)==(0|0);
     if (!($169)) {
      $170 = ((($$3365)) + 20|0);
      HEAP32[$170>>2] = $168;
      $171 = ((($168)) + 24|0);
      HEAP32[$171>>2] = $$3365;
     }
    }
   }
  } while(0);
  $172 = $111 | 1;
  $173 = ((($$1)) + 4|0);
  HEAP32[$173>>2] = $172;
  $174 = (($87) + ($111)|0);
  HEAP32[$174>>2] = $111;
  $175 = HEAP32[(10588)>>2]|0;
  $176 = ($$1|0)==($175|0);
  if ($176) {
   HEAP32[(10576)>>2] = $111;
   return;
  } else {
   $$2 = $111;
  }
 } else {
  $177 = $90 & -2;
  HEAP32[$89>>2] = $177;
  $178 = $$1347 | 1;
  $179 = ((($$1)) + 4|0);
  HEAP32[$179>>2] = $178;
  $180 = (($87) + ($$1347)|0);
  HEAP32[$180>>2] = $$1347;
  $$2 = $$1347;
 }
 $181 = $$2 >>> 3;
 $182 = ($$2>>>0)<(256);
 if ($182) {
  $183 = $181 << 1;
  $184 = (10608 + ($183<<2)|0);
  $185 = HEAP32[2642]|0;
  $186 = 1 << $181;
  $187 = $185 & $186;
  $188 = ($187|0)==(0);
  if ($188) {
   $189 = $185 | $186;
   HEAP32[2642] = $189;
   $$pre = ((($184)) + 8|0);
   $$0368 = $184;$$pre$phiZ2D = $$pre;
  } else {
   $190 = ((($184)) + 8|0);
   $191 = HEAP32[$190>>2]|0;
   $$0368 = $191;$$pre$phiZ2D = $190;
  }
  HEAP32[$$pre$phiZ2D>>2] = $$1;
  $192 = ((($$0368)) + 12|0);
  HEAP32[$192>>2] = $$1;
  $193 = ((($$1)) + 8|0);
  HEAP32[$193>>2] = $$0368;
  $194 = ((($$1)) + 12|0);
  HEAP32[$194>>2] = $184;
  return;
 }
 $195 = $$2 >>> 8;
 $196 = ($195|0)==(0);
 if ($196) {
  $$0361 = 0;
 } else {
  $197 = ($$2>>>0)>(16777215);
  if ($197) {
   $$0361 = 31;
  } else {
   $198 = (($195) + 1048320)|0;
   $199 = $198 >>> 16;
   $200 = $199 & 8;
   $201 = $195 << $200;
   $202 = (($201) + 520192)|0;
   $203 = $202 >>> 16;
   $204 = $203 & 4;
   $205 = $204 | $200;
   $206 = $201 << $204;
   $207 = (($206) + 245760)|0;
   $208 = $207 >>> 16;
   $209 = $208 & 2;
   $210 = $205 | $209;
   $211 = (14 - ($210))|0;
   $212 = $206 << $209;
   $213 = $212 >>> 15;
   $214 = (($211) + ($213))|0;
   $215 = $214 << 1;
   $216 = (($214) + 7)|0;
   $217 = $$2 >>> $216;
   $218 = $217 & 1;
   $219 = $218 | $215;
   $$0361 = $219;
  }
 }
 $220 = (10872 + ($$0361<<2)|0);
 $221 = ((($$1)) + 28|0);
 HEAP32[$221>>2] = $$0361;
 $222 = ((($$1)) + 16|0);
 $223 = ((($$1)) + 20|0);
 HEAP32[$223>>2] = 0;
 HEAP32[$222>>2] = 0;
 $224 = HEAP32[(10572)>>2]|0;
 $225 = 1 << $$0361;
 $226 = $224 & $225;
 $227 = ($226|0)==(0);
 do {
  if ($227) {
   $228 = $224 | $225;
   HEAP32[(10572)>>2] = $228;
   HEAP32[$220>>2] = $$1;
   $229 = ((($$1)) + 24|0);
   HEAP32[$229>>2] = $220;
   $230 = ((($$1)) + 12|0);
   HEAP32[$230>>2] = $$1;
   $231 = ((($$1)) + 8|0);
   HEAP32[$231>>2] = $$1;
  } else {
   $232 = HEAP32[$220>>2]|0;
   $233 = ($$0361|0)==(31);
   $234 = $$0361 >>> 1;
   $235 = (25 - ($234))|0;
   $236 = $233 ? 0 : $235;
   $237 = $$2 << $236;
   $$0348 = $237;$$0349 = $232;
   while(1) {
    $238 = ((($$0349)) + 4|0);
    $239 = HEAP32[$238>>2]|0;
    $240 = $239 & -8;
    $241 = ($240|0)==($$2|0);
    if ($241) {
     label = 73;
     break;
    }
    $242 = $$0348 >>> 31;
    $243 = (((($$0349)) + 16|0) + ($242<<2)|0);
    $244 = $$0348 << 1;
    $245 = HEAP32[$243>>2]|0;
    $246 = ($245|0)==(0|0);
    if ($246) {
     label = 72;
     break;
    } else {
     $$0348 = $244;$$0349 = $245;
    }
   }
   if ((label|0) == 72) {
    HEAP32[$243>>2] = $$1;
    $247 = ((($$1)) + 24|0);
    HEAP32[$247>>2] = $$0349;
    $248 = ((($$1)) + 12|0);
    HEAP32[$248>>2] = $$1;
    $249 = ((($$1)) + 8|0);
    HEAP32[$249>>2] = $$1;
    break;
   }
   else if ((label|0) == 73) {
    $250 = ((($$0349)) + 8|0);
    $251 = HEAP32[$250>>2]|0;
    $252 = ((($251)) + 12|0);
    HEAP32[$252>>2] = $$1;
    HEAP32[$250>>2] = $$1;
    $253 = ((($$1)) + 8|0);
    HEAP32[$253>>2] = $251;
    $254 = ((($$1)) + 12|0);
    HEAP32[$254>>2] = $$0349;
    $255 = ((($$1)) + 24|0);
    HEAP32[$255>>2] = 0;
    break;
   }
  }
 } while(0);
 $256 = HEAP32[(10600)>>2]|0;
 $257 = (($256) + -1)|0;
 HEAP32[(10600)>>2] = $257;
 $258 = ($257|0)==(0);
 if ($258) {
  $$0195$in$i = (11024);
 } else {
  return;
 }
 while(1) {
  $$0195$i = HEAP32[$$0195$in$i>>2]|0;
  $259 = ($$0195$i|0)==(0|0);
  $260 = ((($$0195$i)) + 8|0);
  if ($259) {
   break;
  } else {
   $$0195$in$i = $260;
  }
 }
 HEAP32[(10600)>>2] = -1;
 return;
}
function _realloc($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $$1 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $3 = 0, $4 = 0, $5 = 0;
 var $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $2 = ($0|0)==(0|0);
 if ($2) {
  $3 = (_malloc($1)|0);
  $$1 = $3;
  return ($$1|0);
 }
 $4 = ($1>>>0)>(4294967231);
 if ($4) {
  $5 = (___errno_location()|0);
  HEAP32[$5>>2] = 12;
  $$1 = 0;
  return ($$1|0);
 }
 $6 = ($1>>>0)<(11);
 $7 = (($1) + 11)|0;
 $8 = $7 & -8;
 $9 = $6 ? 16 : $8;
 $10 = ((($0)) + -8|0);
 $11 = (_try_realloc_chunk($10,$9)|0);
 $12 = ($11|0)==(0|0);
 if (!($12)) {
  $13 = ((($11)) + 8|0);
  $$1 = $13;
  return ($$1|0);
 }
 $14 = (_malloc($1)|0);
 $15 = ($14|0)==(0|0);
 if ($15) {
  $$1 = 0;
  return ($$1|0);
 }
 $16 = ((($0)) + -4|0);
 $17 = HEAP32[$16>>2]|0;
 $18 = $17 & -8;
 $19 = $17 & 3;
 $20 = ($19|0)==(0);
 $21 = $20 ? 8 : 4;
 $22 = (($18) - ($21))|0;
 $23 = ($22>>>0)<($1>>>0);
 $24 = $23 ? $22 : $1;
 (_memcpy(($14|0),($0|0),($24|0))|0);
 _free($0);
 $$1 = $14;
 return ($$1|0);
}
function _try_realloc_chunk($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $$1246 = 0, $$1249 = 0, $$2 = 0, $$3 = 0, $$sink1 = 0, $10 = 0, $100 = 0, $101 = 0, $102 = 0, $103 = 0, $104 = 0, $105 = 0, $106 = 0, $107 = 0, $108 = 0, $109 = 0, $11 = 0, $110 = 0, $111 = 0, $112 = 0;
 var $113 = 0, $114 = 0, $115 = 0, $116 = 0, $117 = 0, $118 = 0, $119 = 0, $12 = 0, $120 = 0, $121 = 0, $122 = 0, $123 = 0, $124 = 0, $125 = 0, $126 = 0, $127 = 0, $128 = 0, $129 = 0, $13 = 0, $130 = 0;
 var $131 = 0, $132 = 0, $133 = 0, $134 = 0, $135 = 0, $136 = 0, $137 = 0, $138 = 0, $139 = 0, $14 = 0, $140 = 0, $141 = 0, $142 = 0, $143 = 0, $144 = 0, $145 = 0, $146 = 0, $147 = 0, $148 = 0, $15 = 0;
 var $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0, $29 = 0, $3 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0;
 var $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $4 = 0, $40 = 0, $41 = 0, $42 = 0, $43 = 0, $44 = 0, $45 = 0, $46 = 0, $47 = 0, $48 = 0, $49 = 0, $5 = 0, $50 = 0, $51 = 0;
 var $52 = 0, $53 = 0, $54 = 0, $55 = 0, $56 = 0, $57 = 0, $58 = 0, $59 = 0, $6 = 0, $60 = 0, $61 = 0, $62 = 0, $63 = 0, $64 = 0, $65 = 0, $66 = 0, $67 = 0, $68 = 0, $69 = 0, $7 = 0;
 var $70 = 0, $71 = 0, $72 = 0, $73 = 0, $74 = 0, $75 = 0, $76 = 0, $77 = 0, $78 = 0, $79 = 0, $8 = 0, $80 = 0, $81 = 0, $82 = 0, $83 = 0, $84 = 0, $85 = 0, $86 = 0, $87 = 0, $88 = 0;
 var $89 = 0, $9 = 0, $90 = 0, $91 = 0, $92 = 0, $93 = 0, $94 = 0, $95 = 0, $96 = 0, $97 = 0, $98 = 0, $99 = 0, $cond = 0, $storemerge = 0, $storemerge1 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $2 = ((($0)) + 4|0);
 $3 = HEAP32[$2>>2]|0;
 $4 = $3 & -8;
 $5 = (($0) + ($4)|0);
 $6 = $3 & 3;
 $7 = ($6|0)==(0);
 if ($7) {
  $8 = ($1>>>0)<(256);
  if ($8) {
   $$2 = 0;
   return ($$2|0);
  }
  $9 = (($1) + 4)|0;
  $10 = ($4>>>0)<($9>>>0);
  if (!($10)) {
   $11 = (($4) - ($1))|0;
   $12 = HEAP32[(11048)>>2]|0;
   $13 = $12 << 1;
   $14 = ($11>>>0)>($13>>>0);
   if (!($14)) {
    $$2 = $0;
    return ($$2|0);
   }
  }
  $$2 = 0;
  return ($$2|0);
 }
 $15 = ($4>>>0)<($1>>>0);
 if (!($15)) {
  $16 = (($4) - ($1))|0;
  $17 = ($16>>>0)>(15);
  if (!($17)) {
   $$2 = $0;
   return ($$2|0);
  }
  $18 = (($0) + ($1)|0);
  $19 = $3 & 1;
  $20 = $19 | $1;
  $21 = $20 | 2;
  HEAP32[$2>>2] = $21;
  $22 = ((($18)) + 4|0);
  $23 = $16 | 3;
  HEAP32[$22>>2] = $23;
  $24 = ((($5)) + 4|0);
  $25 = HEAP32[$24>>2]|0;
  $26 = $25 | 1;
  HEAP32[$24>>2] = $26;
  _dispose_chunk($18,$16);
  $$2 = $0;
  return ($$2|0);
 }
 $27 = HEAP32[(10592)>>2]|0;
 $28 = ($27|0)==($5|0);
 if ($28) {
  $29 = HEAP32[(10580)>>2]|0;
  $30 = (($29) + ($4))|0;
  $31 = ($30>>>0)>($1>>>0);
  $32 = (($30) - ($1))|0;
  $33 = (($0) + ($1)|0);
  if (!($31)) {
   $$2 = 0;
   return ($$2|0);
  }
  $34 = $32 | 1;
  $35 = ((($33)) + 4|0);
  $36 = $3 & 1;
  $37 = $36 | $1;
  $38 = $37 | 2;
  HEAP32[$2>>2] = $38;
  HEAP32[$35>>2] = $34;
  HEAP32[(10592)>>2] = $33;
  HEAP32[(10580)>>2] = $32;
  $$2 = $0;
  return ($$2|0);
 }
 $39 = HEAP32[(10588)>>2]|0;
 $40 = ($39|0)==($5|0);
 if ($40) {
  $41 = HEAP32[(10576)>>2]|0;
  $42 = (($41) + ($4))|0;
  $43 = ($42>>>0)<($1>>>0);
  if ($43) {
   $$2 = 0;
   return ($$2|0);
  }
  $44 = (($42) - ($1))|0;
  $45 = ($44>>>0)>(15);
  if ($45) {
   $46 = (($0) + ($1)|0);
   $47 = (($0) + ($42)|0);
   $48 = $3 & 1;
   $49 = $48 | $1;
   $50 = $49 | 2;
   HEAP32[$2>>2] = $50;
   $51 = ((($46)) + 4|0);
   $52 = $44 | 1;
   HEAP32[$51>>2] = $52;
   HEAP32[$47>>2] = $44;
   $53 = ((($47)) + 4|0);
   $54 = HEAP32[$53>>2]|0;
   $55 = $54 & -2;
   HEAP32[$53>>2] = $55;
   $storemerge = $46;$storemerge1 = $44;
  } else {
   $56 = $3 & 1;
   $57 = $56 | $42;
   $58 = $57 | 2;
   HEAP32[$2>>2] = $58;
   $59 = (($0) + ($42)|0);
   $60 = ((($59)) + 4|0);
   $61 = HEAP32[$60>>2]|0;
   $62 = $61 | 1;
   HEAP32[$60>>2] = $62;
   $storemerge = 0;$storemerge1 = 0;
  }
  HEAP32[(10576)>>2] = $storemerge1;
  HEAP32[(10588)>>2] = $storemerge;
  $$2 = $0;
  return ($$2|0);
 }
 $63 = ((($5)) + 4|0);
 $64 = HEAP32[$63>>2]|0;
 $65 = $64 & 2;
 $66 = ($65|0)==(0);
 if (!($66)) {
  $$2 = 0;
  return ($$2|0);
 }
 $67 = $64 & -8;
 $68 = (($67) + ($4))|0;
 $69 = ($68>>>0)<($1>>>0);
 if ($69) {
  $$2 = 0;
  return ($$2|0);
 }
 $70 = (($68) - ($1))|0;
 $71 = $64 >>> 3;
 $72 = ($64>>>0)<(256);
 do {
  if ($72) {
   $73 = ((($5)) + 8|0);
   $74 = HEAP32[$73>>2]|0;
   $75 = ((($5)) + 12|0);
   $76 = HEAP32[$75>>2]|0;
   $77 = ($76|0)==($74|0);
   if ($77) {
    $78 = 1 << $71;
    $79 = $78 ^ -1;
    $80 = HEAP32[2642]|0;
    $81 = $80 & $79;
    HEAP32[2642] = $81;
    break;
   } else {
    $82 = ((($74)) + 12|0);
    HEAP32[$82>>2] = $76;
    $83 = ((($76)) + 8|0);
    HEAP32[$83>>2] = $74;
    break;
   }
  } else {
   $84 = ((($5)) + 24|0);
   $85 = HEAP32[$84>>2]|0;
   $86 = ((($5)) + 12|0);
   $87 = HEAP32[$86>>2]|0;
   $88 = ($87|0)==($5|0);
   do {
    if ($88) {
     $93 = ((($5)) + 16|0);
     $94 = ((($93)) + 4|0);
     $95 = HEAP32[$94>>2]|0;
     $96 = ($95|0)==(0|0);
     if ($96) {
      $97 = HEAP32[$93>>2]|0;
      $98 = ($97|0)==(0|0);
      if ($98) {
       $$3 = 0;
       break;
      } else {
       $$1246 = $97;$$1249 = $93;
      }
     } else {
      $$1246 = $95;$$1249 = $94;
     }
     while(1) {
      $99 = ((($$1246)) + 20|0);
      $100 = HEAP32[$99>>2]|0;
      $101 = ($100|0)==(0|0);
      if (!($101)) {
       $$1246 = $100;$$1249 = $99;
       continue;
      }
      $102 = ((($$1246)) + 16|0);
      $103 = HEAP32[$102>>2]|0;
      $104 = ($103|0)==(0|0);
      if ($104) {
       break;
      } else {
       $$1246 = $103;$$1249 = $102;
      }
     }
     HEAP32[$$1249>>2] = 0;
     $$3 = $$1246;
    } else {
     $89 = ((($5)) + 8|0);
     $90 = HEAP32[$89>>2]|0;
     $91 = ((($90)) + 12|0);
     HEAP32[$91>>2] = $87;
     $92 = ((($87)) + 8|0);
     HEAP32[$92>>2] = $90;
     $$3 = $87;
    }
   } while(0);
   $105 = ($85|0)==(0|0);
   if (!($105)) {
    $106 = ((($5)) + 28|0);
    $107 = HEAP32[$106>>2]|0;
    $108 = (10872 + ($107<<2)|0);
    $109 = HEAP32[$108>>2]|0;
    $110 = ($109|0)==($5|0);
    if ($110) {
     HEAP32[$108>>2] = $$3;
     $cond = ($$3|0)==(0|0);
     if ($cond) {
      $111 = 1 << $107;
      $112 = $111 ^ -1;
      $113 = HEAP32[(10572)>>2]|0;
      $114 = $113 & $112;
      HEAP32[(10572)>>2] = $114;
      break;
     }
    } else {
     $115 = ((($85)) + 16|0);
     $116 = HEAP32[$115>>2]|0;
     $117 = ($116|0)!=($5|0);
     $$sink1 = $117&1;
     $118 = (((($85)) + 16|0) + ($$sink1<<2)|0);
     HEAP32[$118>>2] = $$3;
     $119 = ($$3|0)==(0|0);
     if ($119) {
      break;
     }
    }
    $120 = ((($$3)) + 24|0);
    HEAP32[$120>>2] = $85;
    $121 = ((($5)) + 16|0);
    $122 = HEAP32[$121>>2]|0;
    $123 = ($122|0)==(0|0);
    if (!($123)) {
     $124 = ((($$3)) + 16|0);
     HEAP32[$124>>2] = $122;
     $125 = ((($122)) + 24|0);
     HEAP32[$125>>2] = $$3;
    }
    $126 = ((($121)) + 4|0);
    $127 = HEAP32[$126>>2]|0;
    $128 = ($127|0)==(0|0);
    if (!($128)) {
     $129 = ((($$3)) + 20|0);
     HEAP32[$129>>2] = $127;
     $130 = ((($127)) + 24|0);
     HEAP32[$130>>2] = $$3;
    }
   }
  }
 } while(0);
 $131 = ($70>>>0)<(16);
 if ($131) {
  $132 = $3 & 1;
  $133 = $68 | $132;
  $134 = $133 | 2;
  HEAP32[$2>>2] = $134;
  $135 = (($0) + ($68)|0);
  $136 = ((($135)) + 4|0);
  $137 = HEAP32[$136>>2]|0;
  $138 = $137 | 1;
  HEAP32[$136>>2] = $138;
  $$2 = $0;
  return ($$2|0);
 } else {
  $139 = (($0) + ($1)|0);
  $140 = $3 & 1;
  $141 = $140 | $1;
  $142 = $141 | 2;
  HEAP32[$2>>2] = $142;
  $143 = ((($139)) + 4|0);
  $144 = $70 | 3;
  HEAP32[$143>>2] = $144;
  $145 = (($0) + ($68)|0);
  $146 = ((($145)) + 4|0);
  $147 = HEAP32[$146>>2]|0;
  $148 = $147 | 1;
  HEAP32[$146>>2] = $148;
  _dispose_chunk($139,$70);
  $$2 = $0;
  return ($$2|0);
 }
 return (0)|0;
}
function _dispose_chunk($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $$0366 = 0, $$0367 = 0, $$0378 = 0, $$0385 = 0, $$1 = 0, $$1365 = 0, $$1373 = 0, $$1376 = 0, $$1380 = 0, $$1384 = 0, $$2 = 0, $$3 = 0, $$3382 = 0, $$pre = 0, $$pre$phiZ2D = 0, $$sink2 = 0, $$sink4 = 0, $10 = 0, $100 = 0, $101 = 0;
 var $102 = 0, $103 = 0, $104 = 0, $105 = 0, $106 = 0, $107 = 0, $108 = 0, $109 = 0, $11 = 0, $110 = 0, $111 = 0, $112 = 0, $113 = 0, $114 = 0, $115 = 0, $116 = 0, $117 = 0, $118 = 0, $119 = 0, $12 = 0;
 var $120 = 0, $121 = 0, $122 = 0, $123 = 0, $124 = 0, $125 = 0, $126 = 0, $127 = 0, $128 = 0, $129 = 0, $13 = 0, $130 = 0, $131 = 0, $132 = 0, $133 = 0, $134 = 0, $135 = 0, $136 = 0, $137 = 0, $138 = 0;
 var $139 = 0, $14 = 0, $140 = 0, $141 = 0, $142 = 0, $143 = 0, $144 = 0, $145 = 0, $146 = 0, $147 = 0, $148 = 0, $149 = 0, $15 = 0, $150 = 0, $151 = 0, $152 = 0, $153 = 0, $154 = 0, $155 = 0, $156 = 0;
 var $157 = 0, $158 = 0, $159 = 0, $16 = 0, $160 = 0, $161 = 0, $162 = 0, $163 = 0, $164 = 0, $165 = 0, $166 = 0, $167 = 0, $168 = 0, $169 = 0, $17 = 0, $170 = 0, $171 = 0, $172 = 0, $173 = 0, $174 = 0;
 var $175 = 0, $176 = 0, $177 = 0, $178 = 0, $179 = 0, $18 = 0, $180 = 0, $181 = 0, $182 = 0, $183 = 0, $184 = 0, $185 = 0, $186 = 0, $187 = 0, $188 = 0, $189 = 0, $19 = 0, $190 = 0, $191 = 0, $192 = 0;
 var $193 = 0, $194 = 0, $195 = 0, $196 = 0, $197 = 0, $198 = 0, $199 = 0, $2 = 0, $20 = 0, $200 = 0, $201 = 0, $202 = 0, $203 = 0, $204 = 0, $205 = 0, $206 = 0, $207 = 0, $208 = 0, $209 = 0, $21 = 0;
 var $210 = 0, $211 = 0, $212 = 0, $213 = 0, $214 = 0, $215 = 0, $216 = 0, $217 = 0, $218 = 0, $219 = 0, $22 = 0, $220 = 0, $221 = 0, $222 = 0, $223 = 0, $224 = 0, $225 = 0, $226 = 0, $227 = 0, $228 = 0;
 var $229 = 0, $23 = 0, $230 = 0, $231 = 0, $232 = 0, $233 = 0, $234 = 0, $235 = 0, $236 = 0, $237 = 0, $238 = 0, $239 = 0, $24 = 0, $240 = 0, $241 = 0, $242 = 0, $243 = 0, $244 = 0, $245 = 0, $246 = 0;
 var $25 = 0, $26 = 0, $27 = 0, $28 = 0, $29 = 0, $3 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $4 = 0, $40 = 0, $41 = 0, $42 = 0;
 var $43 = 0, $44 = 0, $45 = 0, $46 = 0, $47 = 0, $48 = 0, $49 = 0, $5 = 0, $50 = 0, $51 = 0, $52 = 0, $53 = 0, $54 = 0, $55 = 0, $56 = 0, $57 = 0, $58 = 0, $59 = 0, $6 = 0, $60 = 0;
 var $61 = 0, $62 = 0, $63 = 0, $64 = 0, $65 = 0, $66 = 0, $67 = 0, $68 = 0, $69 = 0, $7 = 0, $70 = 0, $71 = 0, $72 = 0, $73 = 0, $74 = 0, $75 = 0, $76 = 0, $77 = 0, $78 = 0, $79 = 0;
 var $8 = 0, $80 = 0, $81 = 0, $82 = 0, $83 = 0, $84 = 0, $85 = 0, $86 = 0, $87 = 0, $88 = 0, $89 = 0, $9 = 0, $90 = 0, $91 = 0, $92 = 0, $93 = 0, $94 = 0, $95 = 0, $96 = 0, $97 = 0;
 var $98 = 0, $99 = 0, $cond = 0, $cond3 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $2 = (($0) + ($1)|0);
 $3 = ((($0)) + 4|0);
 $4 = HEAP32[$3>>2]|0;
 $5 = $4 & 1;
 $6 = ($5|0)==(0);
 do {
  if ($6) {
   $7 = HEAP32[$0>>2]|0;
   $8 = $4 & 3;
   $9 = ($8|0)==(0);
   if ($9) {
    return;
   }
   $10 = (0 - ($7))|0;
   $11 = (($0) + ($10)|0);
   $12 = (($7) + ($1))|0;
   $13 = HEAP32[(10588)>>2]|0;
   $14 = ($13|0)==($11|0);
   if ($14) {
    $75 = ((($2)) + 4|0);
    $76 = HEAP32[$75>>2]|0;
    $77 = $76 & 3;
    $78 = ($77|0)==(3);
    if (!($78)) {
     $$1 = $11;$$1365 = $12;
     break;
    }
    HEAP32[(10576)>>2] = $12;
    $79 = $76 & -2;
    HEAP32[$75>>2] = $79;
    $80 = $12 | 1;
    $81 = ((($11)) + 4|0);
    HEAP32[$81>>2] = $80;
    HEAP32[$2>>2] = $12;
    return;
   }
   $15 = $7 >>> 3;
   $16 = ($7>>>0)<(256);
   if ($16) {
    $17 = ((($11)) + 8|0);
    $18 = HEAP32[$17>>2]|0;
    $19 = ((($11)) + 12|0);
    $20 = HEAP32[$19>>2]|0;
    $21 = ($20|0)==($18|0);
    if ($21) {
     $22 = 1 << $15;
     $23 = $22 ^ -1;
     $24 = HEAP32[2642]|0;
     $25 = $24 & $23;
     HEAP32[2642] = $25;
     $$1 = $11;$$1365 = $12;
     break;
    } else {
     $26 = ((($18)) + 12|0);
     HEAP32[$26>>2] = $20;
     $27 = ((($20)) + 8|0);
     HEAP32[$27>>2] = $18;
     $$1 = $11;$$1365 = $12;
     break;
    }
   }
   $28 = ((($11)) + 24|0);
   $29 = HEAP32[$28>>2]|0;
   $30 = ((($11)) + 12|0);
   $31 = HEAP32[$30>>2]|0;
   $32 = ($31|0)==($11|0);
   do {
    if ($32) {
     $37 = ((($11)) + 16|0);
     $38 = ((($37)) + 4|0);
     $39 = HEAP32[$38>>2]|0;
     $40 = ($39|0)==(0|0);
     if ($40) {
      $41 = HEAP32[$37>>2]|0;
      $42 = ($41|0)==(0|0);
      if ($42) {
       $$3 = 0;
       break;
      } else {
       $$1373 = $41;$$1376 = $37;
      }
     } else {
      $$1373 = $39;$$1376 = $38;
     }
     while(1) {
      $43 = ((($$1373)) + 20|0);
      $44 = HEAP32[$43>>2]|0;
      $45 = ($44|0)==(0|0);
      if (!($45)) {
       $$1373 = $44;$$1376 = $43;
       continue;
      }
      $46 = ((($$1373)) + 16|0);
      $47 = HEAP32[$46>>2]|0;
      $48 = ($47|0)==(0|0);
      if ($48) {
       break;
      } else {
       $$1373 = $47;$$1376 = $46;
      }
     }
     HEAP32[$$1376>>2] = 0;
     $$3 = $$1373;
    } else {
     $33 = ((($11)) + 8|0);
     $34 = HEAP32[$33>>2]|0;
     $35 = ((($34)) + 12|0);
     HEAP32[$35>>2] = $31;
     $36 = ((($31)) + 8|0);
     HEAP32[$36>>2] = $34;
     $$3 = $31;
    }
   } while(0);
   $49 = ($29|0)==(0|0);
   if ($49) {
    $$1 = $11;$$1365 = $12;
   } else {
    $50 = ((($11)) + 28|0);
    $51 = HEAP32[$50>>2]|0;
    $52 = (10872 + ($51<<2)|0);
    $53 = HEAP32[$52>>2]|0;
    $54 = ($53|0)==($11|0);
    if ($54) {
     HEAP32[$52>>2] = $$3;
     $cond = ($$3|0)==(0|0);
     if ($cond) {
      $55 = 1 << $51;
      $56 = $55 ^ -1;
      $57 = HEAP32[(10572)>>2]|0;
      $58 = $57 & $56;
      HEAP32[(10572)>>2] = $58;
      $$1 = $11;$$1365 = $12;
      break;
     }
    } else {
     $59 = ((($29)) + 16|0);
     $60 = HEAP32[$59>>2]|0;
     $61 = ($60|0)!=($11|0);
     $$sink2 = $61&1;
     $62 = (((($29)) + 16|0) + ($$sink2<<2)|0);
     HEAP32[$62>>2] = $$3;
     $63 = ($$3|0)==(0|0);
     if ($63) {
      $$1 = $11;$$1365 = $12;
      break;
     }
    }
    $64 = ((($$3)) + 24|0);
    HEAP32[$64>>2] = $29;
    $65 = ((($11)) + 16|0);
    $66 = HEAP32[$65>>2]|0;
    $67 = ($66|0)==(0|0);
    if (!($67)) {
     $68 = ((($$3)) + 16|0);
     HEAP32[$68>>2] = $66;
     $69 = ((($66)) + 24|0);
     HEAP32[$69>>2] = $$3;
    }
    $70 = ((($65)) + 4|0);
    $71 = HEAP32[$70>>2]|0;
    $72 = ($71|0)==(0|0);
    if ($72) {
     $$1 = $11;$$1365 = $12;
    } else {
     $73 = ((($$3)) + 20|0);
     HEAP32[$73>>2] = $71;
     $74 = ((($71)) + 24|0);
     HEAP32[$74>>2] = $$3;
     $$1 = $11;$$1365 = $12;
    }
   }
  } else {
   $$1 = $0;$$1365 = $1;
  }
 } while(0);
 $82 = ((($2)) + 4|0);
 $83 = HEAP32[$82>>2]|0;
 $84 = $83 & 2;
 $85 = ($84|0)==(0);
 if ($85) {
  $86 = HEAP32[(10592)>>2]|0;
  $87 = ($86|0)==($2|0);
  if ($87) {
   $88 = HEAP32[(10580)>>2]|0;
   $89 = (($88) + ($$1365))|0;
   HEAP32[(10580)>>2] = $89;
   HEAP32[(10592)>>2] = $$1;
   $90 = $89 | 1;
   $91 = ((($$1)) + 4|0);
   HEAP32[$91>>2] = $90;
   $92 = HEAP32[(10588)>>2]|0;
   $93 = ($$1|0)==($92|0);
   if (!($93)) {
    return;
   }
   HEAP32[(10588)>>2] = 0;
   HEAP32[(10576)>>2] = 0;
   return;
  }
  $94 = HEAP32[(10588)>>2]|0;
  $95 = ($94|0)==($2|0);
  if ($95) {
   $96 = HEAP32[(10576)>>2]|0;
   $97 = (($96) + ($$1365))|0;
   HEAP32[(10576)>>2] = $97;
   HEAP32[(10588)>>2] = $$1;
   $98 = $97 | 1;
   $99 = ((($$1)) + 4|0);
   HEAP32[$99>>2] = $98;
   $100 = (($$1) + ($97)|0);
   HEAP32[$100>>2] = $97;
   return;
  }
  $101 = $83 & -8;
  $102 = (($101) + ($$1365))|0;
  $103 = $83 >>> 3;
  $104 = ($83>>>0)<(256);
  do {
   if ($104) {
    $105 = ((($2)) + 8|0);
    $106 = HEAP32[$105>>2]|0;
    $107 = ((($2)) + 12|0);
    $108 = HEAP32[$107>>2]|0;
    $109 = ($108|0)==($106|0);
    if ($109) {
     $110 = 1 << $103;
     $111 = $110 ^ -1;
     $112 = HEAP32[2642]|0;
     $113 = $112 & $111;
     HEAP32[2642] = $113;
     break;
    } else {
     $114 = ((($106)) + 12|0);
     HEAP32[$114>>2] = $108;
     $115 = ((($108)) + 8|0);
     HEAP32[$115>>2] = $106;
     break;
    }
   } else {
    $116 = ((($2)) + 24|0);
    $117 = HEAP32[$116>>2]|0;
    $118 = ((($2)) + 12|0);
    $119 = HEAP32[$118>>2]|0;
    $120 = ($119|0)==($2|0);
    do {
     if ($120) {
      $125 = ((($2)) + 16|0);
      $126 = ((($125)) + 4|0);
      $127 = HEAP32[$126>>2]|0;
      $128 = ($127|0)==(0|0);
      if ($128) {
       $129 = HEAP32[$125>>2]|0;
       $130 = ($129|0)==(0|0);
       if ($130) {
        $$3382 = 0;
        break;
       } else {
        $$1380 = $129;$$1384 = $125;
       }
      } else {
       $$1380 = $127;$$1384 = $126;
      }
      while(1) {
       $131 = ((($$1380)) + 20|0);
       $132 = HEAP32[$131>>2]|0;
       $133 = ($132|0)==(0|0);
       if (!($133)) {
        $$1380 = $132;$$1384 = $131;
        continue;
       }
       $134 = ((($$1380)) + 16|0);
       $135 = HEAP32[$134>>2]|0;
       $136 = ($135|0)==(0|0);
       if ($136) {
        break;
       } else {
        $$1380 = $135;$$1384 = $134;
       }
      }
      HEAP32[$$1384>>2] = 0;
      $$3382 = $$1380;
     } else {
      $121 = ((($2)) + 8|0);
      $122 = HEAP32[$121>>2]|0;
      $123 = ((($122)) + 12|0);
      HEAP32[$123>>2] = $119;
      $124 = ((($119)) + 8|0);
      HEAP32[$124>>2] = $122;
      $$3382 = $119;
     }
    } while(0);
    $137 = ($117|0)==(0|0);
    if (!($137)) {
     $138 = ((($2)) + 28|0);
     $139 = HEAP32[$138>>2]|0;
     $140 = (10872 + ($139<<2)|0);
     $141 = HEAP32[$140>>2]|0;
     $142 = ($141|0)==($2|0);
     if ($142) {
      HEAP32[$140>>2] = $$3382;
      $cond3 = ($$3382|0)==(0|0);
      if ($cond3) {
       $143 = 1 << $139;
       $144 = $143 ^ -1;
       $145 = HEAP32[(10572)>>2]|0;
       $146 = $145 & $144;
       HEAP32[(10572)>>2] = $146;
       break;
      }
     } else {
      $147 = ((($117)) + 16|0);
      $148 = HEAP32[$147>>2]|0;
      $149 = ($148|0)!=($2|0);
      $$sink4 = $149&1;
      $150 = (((($117)) + 16|0) + ($$sink4<<2)|0);
      HEAP32[$150>>2] = $$3382;
      $151 = ($$3382|0)==(0|0);
      if ($151) {
       break;
      }
     }
     $152 = ((($$3382)) + 24|0);
     HEAP32[$152>>2] = $117;
     $153 = ((($2)) + 16|0);
     $154 = HEAP32[$153>>2]|0;
     $155 = ($154|0)==(0|0);
     if (!($155)) {
      $156 = ((($$3382)) + 16|0);
      HEAP32[$156>>2] = $154;
      $157 = ((($154)) + 24|0);
      HEAP32[$157>>2] = $$3382;
     }
     $158 = ((($153)) + 4|0);
     $159 = HEAP32[$158>>2]|0;
     $160 = ($159|0)==(0|0);
     if (!($160)) {
      $161 = ((($$3382)) + 20|0);
      HEAP32[$161>>2] = $159;
      $162 = ((($159)) + 24|0);
      HEAP32[$162>>2] = $$3382;
     }
    }
   }
  } while(0);
  $163 = $102 | 1;
  $164 = ((($$1)) + 4|0);
  HEAP32[$164>>2] = $163;
  $165 = (($$1) + ($102)|0);
  HEAP32[$165>>2] = $102;
  $166 = HEAP32[(10588)>>2]|0;
  $167 = ($$1|0)==($166|0);
  if ($167) {
   HEAP32[(10576)>>2] = $102;
   return;
  } else {
   $$2 = $102;
  }
 } else {
  $168 = $83 & -2;
  HEAP32[$82>>2] = $168;
  $169 = $$1365 | 1;
  $170 = ((($$1)) + 4|0);
  HEAP32[$170>>2] = $169;
  $171 = (($$1) + ($$1365)|0);
  HEAP32[$171>>2] = $$1365;
  $$2 = $$1365;
 }
 $172 = $$2 >>> 3;
 $173 = ($$2>>>0)<(256);
 if ($173) {
  $174 = $172 << 1;
  $175 = (10608 + ($174<<2)|0);
  $176 = HEAP32[2642]|0;
  $177 = 1 << $172;
  $178 = $176 & $177;
  $179 = ($178|0)==(0);
  if ($179) {
   $180 = $176 | $177;
   HEAP32[2642] = $180;
   $$pre = ((($175)) + 8|0);
   $$0385 = $175;$$pre$phiZ2D = $$pre;
  } else {
   $181 = ((($175)) + 8|0);
   $182 = HEAP32[$181>>2]|0;
   $$0385 = $182;$$pre$phiZ2D = $181;
  }
  HEAP32[$$pre$phiZ2D>>2] = $$1;
  $183 = ((($$0385)) + 12|0);
  HEAP32[$183>>2] = $$1;
  $184 = ((($$1)) + 8|0);
  HEAP32[$184>>2] = $$0385;
  $185 = ((($$1)) + 12|0);
  HEAP32[$185>>2] = $175;
  return;
 }
 $186 = $$2 >>> 8;
 $187 = ($186|0)==(0);
 if ($187) {
  $$0378 = 0;
 } else {
  $188 = ($$2>>>0)>(16777215);
  if ($188) {
   $$0378 = 31;
  } else {
   $189 = (($186) + 1048320)|0;
   $190 = $189 >>> 16;
   $191 = $190 & 8;
   $192 = $186 << $191;
   $193 = (($192) + 520192)|0;
   $194 = $193 >>> 16;
   $195 = $194 & 4;
   $196 = $195 | $191;
   $197 = $192 << $195;
   $198 = (($197) + 245760)|0;
   $199 = $198 >>> 16;
   $200 = $199 & 2;
   $201 = $196 | $200;
   $202 = (14 - ($201))|0;
   $203 = $197 << $200;
   $204 = $203 >>> 15;
   $205 = (($202) + ($204))|0;
   $206 = $205 << 1;
   $207 = (($205) + 7)|0;
   $208 = $$2 >>> $207;
   $209 = $208 & 1;
   $210 = $209 | $206;
   $$0378 = $210;
  }
 }
 $211 = (10872 + ($$0378<<2)|0);
 $212 = ((($$1)) + 28|0);
 HEAP32[$212>>2] = $$0378;
 $213 = ((($$1)) + 16|0);
 $214 = ((($$1)) + 20|0);
 HEAP32[$214>>2] = 0;
 HEAP32[$213>>2] = 0;
 $215 = HEAP32[(10572)>>2]|0;
 $216 = 1 << $$0378;
 $217 = $215 & $216;
 $218 = ($217|0)==(0);
 if ($218) {
  $219 = $215 | $216;
  HEAP32[(10572)>>2] = $219;
  HEAP32[$211>>2] = $$1;
  $220 = ((($$1)) + 24|0);
  HEAP32[$220>>2] = $211;
  $221 = ((($$1)) + 12|0);
  HEAP32[$221>>2] = $$1;
  $222 = ((($$1)) + 8|0);
  HEAP32[$222>>2] = $$1;
  return;
 }
 $223 = HEAP32[$211>>2]|0;
 $224 = ($$0378|0)==(31);
 $225 = $$0378 >>> 1;
 $226 = (25 - ($225))|0;
 $227 = $224 ? 0 : $226;
 $228 = $$2 << $227;
 $$0366 = $228;$$0367 = $223;
 while(1) {
  $229 = ((($$0367)) + 4|0);
  $230 = HEAP32[$229>>2]|0;
  $231 = $230 & -8;
  $232 = ($231|0)==($$2|0);
  if ($232) {
   label = 69;
   break;
  }
  $233 = $$0366 >>> 31;
  $234 = (((($$0367)) + 16|0) + ($233<<2)|0);
  $235 = $$0366 << 1;
  $236 = HEAP32[$234>>2]|0;
  $237 = ($236|0)==(0|0);
  if ($237) {
   label = 68;
   break;
  } else {
   $$0366 = $235;$$0367 = $236;
  }
 }
 if ((label|0) == 68) {
  HEAP32[$234>>2] = $$1;
  $238 = ((($$1)) + 24|0);
  HEAP32[$238>>2] = $$0367;
  $239 = ((($$1)) + 12|0);
  HEAP32[$239>>2] = $$1;
  $240 = ((($$1)) + 8|0);
  HEAP32[$240>>2] = $$1;
  return;
 }
 else if ((label|0) == 69) {
  $241 = ((($$0367)) + 8|0);
  $242 = HEAP32[$241>>2]|0;
  $243 = ((($242)) + 12|0);
  HEAP32[$243>>2] = $$1;
  HEAP32[$241>>2] = $$1;
  $244 = ((($$1)) + 8|0);
  HEAP32[$244>>2] = $242;
  $245 = ((($$1)) + 12|0);
  HEAP32[$245>>2] = $$0367;
  $246 = ((($$1)) + 24|0);
  HEAP32[$246>>2] = 0;
  return;
 }
}
function ___stdio_close($0) {
 $0 = $0|0;
 var $1 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $vararg_buffer = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $vararg_buffer = sp;
 $1 = ((($0)) + 60|0);
 $2 = HEAP32[$1>>2]|0;
 $3 = (_dummy_271($2)|0);
 HEAP32[$vararg_buffer>>2] = $3;
 $4 = (___syscall6(6,($vararg_buffer|0))|0);
 $5 = (___syscall_ret($4)|0);
 STACKTOP = sp;return ($5|0);
}
function ___stdio_seek($0,$1,$2) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 var $$pre = 0, $10 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, $vararg_buffer = 0, $vararg_ptr1 = 0, $vararg_ptr2 = 0, $vararg_ptr3 = 0, $vararg_ptr4 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 32|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(32|0);
 $vararg_buffer = sp;
 $3 = sp + 20|0;
 $4 = ((($0)) + 60|0);
 $5 = HEAP32[$4>>2]|0;
 $6 = $3;
 HEAP32[$vararg_buffer>>2] = $5;
 $vararg_ptr1 = ((($vararg_buffer)) + 4|0);
 HEAP32[$vararg_ptr1>>2] = 0;
 $vararg_ptr2 = ((($vararg_buffer)) + 8|0);
 HEAP32[$vararg_ptr2>>2] = $1;
 $vararg_ptr3 = ((($vararg_buffer)) + 12|0);
 HEAP32[$vararg_ptr3>>2] = $6;
 $vararg_ptr4 = ((($vararg_buffer)) + 16|0);
 HEAP32[$vararg_ptr4>>2] = $2;
 $7 = (___syscall140(140,($vararg_buffer|0))|0);
 $8 = (___syscall_ret($7)|0);
 $9 = ($8|0)<(0);
 if ($9) {
  HEAP32[$3>>2] = -1;
  $10 = -1;
 } else {
  $$pre = HEAP32[$3>>2]|0;
  $10 = $$pre;
 }
 STACKTOP = sp;return ($10|0);
}
function ___syscall_ret($0) {
 $0 = $0|0;
 var $$0 = 0, $1 = 0, $2 = 0, $3 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $1 = ($0>>>0)>(4294963200);
 if ($1) {
  $2 = (0 - ($0))|0;
  $3 = (___errno_location()|0);
  HEAP32[$3>>2] = $2;
  $$0 = -1;
 } else {
  $$0 = $0;
 }
 return ($$0|0);
}
function ___errno_location() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 return (11064|0);
}
function _dummy_271($0) {
 $0 = $0|0;
 var label = 0, sp = 0;
 sp = STACKTOP;
 return ($0|0);
}
function ___stdout_write($0,$1,$2) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 var $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, $vararg_buffer = 0, $vararg_ptr1 = 0, $vararg_ptr2 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 32|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(32|0);
 $vararg_buffer = sp;
 $3 = sp + 16|0;
 $4 = ((($0)) + 36|0);
 HEAP32[$4>>2] = 4;
 $5 = HEAP32[$0>>2]|0;
 $6 = $5 & 64;
 $7 = ($6|0)==(0);
 if ($7) {
  $8 = ((($0)) + 60|0);
  $9 = HEAP32[$8>>2]|0;
  $10 = $3;
  HEAP32[$vararg_buffer>>2] = $9;
  $vararg_ptr1 = ((($vararg_buffer)) + 4|0);
  HEAP32[$vararg_ptr1>>2] = 21523;
  $vararg_ptr2 = ((($vararg_buffer)) + 8|0);
  HEAP32[$vararg_ptr2>>2] = $10;
  $11 = (___syscall54(54,($vararg_buffer|0))|0);
  $12 = ($11|0)==(0);
  if (!($12)) {
   $13 = ((($0)) + 75|0);
   HEAP8[$13>>0] = -1;
  }
 }
 $14 = (___stdio_write($0,$1,$2)|0);
 STACKTOP = sp;return ($14|0);
}
function ___stdio_write($0,$1,$2) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 var $$0 = 0, $$04756 = 0, $$04855 = 0, $$04954 = 0, $$051 = 0, $$1 = 0, $$150 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $20 = 0, $21 = 0, $22 = 0;
 var $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0, $29 = 0, $3 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $4 = 0, $40 = 0;
 var $41 = 0, $42 = 0, $43 = 0, $44 = 0, $45 = 0, $46 = 0, $47 = 0, $48 = 0, $49 = 0, $5 = 0, $50 = 0, $51 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, $vararg_buffer = 0, $vararg_buffer3 = 0, $vararg_ptr1 = 0, $vararg_ptr2 = 0;
 var $vararg_ptr6 = 0, $vararg_ptr7 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 48|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(48|0);
 $vararg_buffer3 = sp + 16|0;
 $vararg_buffer = sp;
 $3 = sp + 32|0;
 $4 = ((($0)) + 28|0);
 $5 = HEAP32[$4>>2]|0;
 HEAP32[$3>>2] = $5;
 $6 = ((($3)) + 4|0);
 $7 = ((($0)) + 20|0);
 $8 = HEAP32[$7>>2]|0;
 $9 = (($8) - ($5))|0;
 HEAP32[$6>>2] = $9;
 $10 = ((($3)) + 8|0);
 HEAP32[$10>>2] = $1;
 $11 = ((($3)) + 12|0);
 HEAP32[$11>>2] = $2;
 $12 = (($9) + ($2))|0;
 $13 = ((($0)) + 60|0);
 $14 = HEAP32[$13>>2]|0;
 $15 = $3;
 HEAP32[$vararg_buffer>>2] = $14;
 $vararg_ptr1 = ((($vararg_buffer)) + 4|0);
 HEAP32[$vararg_ptr1>>2] = $15;
 $vararg_ptr2 = ((($vararg_buffer)) + 8|0);
 HEAP32[$vararg_ptr2>>2] = 2;
 $16 = (___syscall146(146,($vararg_buffer|0))|0);
 $17 = (___syscall_ret($16)|0);
 $18 = ($12|0)==($17|0);
 L1: do {
  if ($18) {
   label = 3;
  } else {
   $$04756 = 2;$$04855 = $12;$$04954 = $3;$26 = $17;
   while(1) {
    $27 = ($26|0)<(0);
    if ($27) {
     break;
    }
    $35 = (($$04855) - ($26))|0;
    $36 = ((($$04954)) + 4|0);
    $37 = HEAP32[$36>>2]|0;
    $38 = ($26>>>0)>($37>>>0);
    $39 = ((($$04954)) + 8|0);
    $$150 = $38 ? $39 : $$04954;
    $40 = $38 << 31 >> 31;
    $$1 = (($$04756) + ($40))|0;
    $41 = $38 ? $37 : 0;
    $$0 = (($26) - ($41))|0;
    $42 = HEAP32[$$150>>2]|0;
    $43 = (($42) + ($$0)|0);
    HEAP32[$$150>>2] = $43;
    $44 = ((($$150)) + 4|0);
    $45 = HEAP32[$44>>2]|0;
    $46 = (($45) - ($$0))|0;
    HEAP32[$44>>2] = $46;
    $47 = HEAP32[$13>>2]|0;
    $48 = $$150;
    HEAP32[$vararg_buffer3>>2] = $47;
    $vararg_ptr6 = ((($vararg_buffer3)) + 4|0);
    HEAP32[$vararg_ptr6>>2] = $48;
    $vararg_ptr7 = ((($vararg_buffer3)) + 8|0);
    HEAP32[$vararg_ptr7>>2] = $$1;
    $49 = (___syscall146(146,($vararg_buffer3|0))|0);
    $50 = (___syscall_ret($49)|0);
    $51 = ($35|0)==($50|0);
    if ($51) {
     label = 3;
     break L1;
    } else {
     $$04756 = $$1;$$04855 = $35;$$04954 = $$150;$26 = $50;
    }
   }
   $28 = ((($0)) + 16|0);
   HEAP32[$28>>2] = 0;
   HEAP32[$4>>2] = 0;
   HEAP32[$7>>2] = 0;
   $29 = HEAP32[$0>>2]|0;
   $30 = $29 | 32;
   HEAP32[$0>>2] = $30;
   $31 = ($$04756|0)==(2);
   if ($31) {
    $$051 = 0;
   } else {
    $32 = ((($$04954)) + 4|0);
    $33 = HEAP32[$32>>2]|0;
    $34 = (($2) - ($33))|0;
    $$051 = $34;
   }
  }
 } while(0);
 if ((label|0) == 3) {
  $19 = ((($0)) + 44|0);
  $20 = HEAP32[$19>>2]|0;
  $21 = ((($0)) + 48|0);
  $22 = HEAP32[$21>>2]|0;
  $23 = (($20) + ($22)|0);
  $24 = ((($0)) + 16|0);
  HEAP32[$24>>2] = $23;
  $25 = $20;
  HEAP32[$4>>2] = $25;
  HEAP32[$7>>2] = $25;
  $$051 = $2;
 }
 STACKTOP = sp;return ($$051|0);
}
function _pthread_self() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 return (344|0);
}
function _strcmp($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $$011 = 0, $$0710 = 0, $$lcssa = 0, $$lcssa8 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, $or$cond = 0, $or$cond9 = 0, label = 0;
 var sp = 0;
 sp = STACKTOP;
 $2 = HEAP8[$0>>0]|0;
 $3 = HEAP8[$1>>0]|0;
 $4 = ($2<<24>>24)!=($3<<24>>24);
 $5 = ($2<<24>>24)==(0);
 $or$cond9 = $5 | $4;
 if ($or$cond9) {
  $$lcssa = $3;$$lcssa8 = $2;
 } else {
  $$011 = $1;$$0710 = $0;
  while(1) {
   $6 = ((($$0710)) + 1|0);
   $7 = ((($$011)) + 1|0);
   $8 = HEAP8[$6>>0]|0;
   $9 = HEAP8[$7>>0]|0;
   $10 = ($8<<24>>24)!=($9<<24>>24);
   $11 = ($8<<24>>24)==(0);
   $or$cond = $11 | $10;
   if ($or$cond) {
    $$lcssa = $9;$$lcssa8 = $8;
    break;
   } else {
    $$011 = $7;$$0710 = $6;
   }
  }
 }
 $12 = $$lcssa8&255;
 $13 = $$lcssa&255;
 $14 = (($12) - ($13))|0;
 return ($14|0);
}
function _memchr($0,$1,$2) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 var $$0$lcssa = 0, $$035$lcssa = 0, $$035$lcssa65 = 0, $$03555 = 0, $$036$lcssa = 0, $$036$lcssa64 = 0, $$03654 = 0, $$046 = 0, $$137$lcssa = 0, $$13745 = 0, $$140 = 0, $$2 = 0, $$23839 = 0, $$3 = 0, $$lcssa = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0;
 var $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0, $29 = 0, $3 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0;
 var $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, $or$cond = 0, $or$cond53 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $3 = $1 & 255;
 $4 = $0;
 $5 = $4 & 3;
 $6 = ($5|0)!=(0);
 $7 = ($2|0)!=(0);
 $or$cond53 = $7 & $6;
 L1: do {
  if ($or$cond53) {
   $8 = $1&255;
   $$03555 = $0;$$03654 = $2;
   while(1) {
    $9 = HEAP8[$$03555>>0]|0;
    $10 = ($9<<24>>24)==($8<<24>>24);
    if ($10) {
     $$035$lcssa65 = $$03555;$$036$lcssa64 = $$03654;
     label = 6;
     break L1;
    }
    $11 = ((($$03555)) + 1|0);
    $12 = (($$03654) + -1)|0;
    $13 = $11;
    $14 = $13 & 3;
    $15 = ($14|0)!=(0);
    $16 = ($12|0)!=(0);
    $or$cond = $16 & $15;
    if ($or$cond) {
     $$03555 = $11;$$03654 = $12;
    } else {
     $$035$lcssa = $11;$$036$lcssa = $12;$$lcssa = $16;
     label = 5;
     break;
    }
   }
  } else {
   $$035$lcssa = $0;$$036$lcssa = $2;$$lcssa = $7;
   label = 5;
  }
 } while(0);
 if ((label|0) == 5) {
  if ($$lcssa) {
   $$035$lcssa65 = $$035$lcssa;$$036$lcssa64 = $$036$lcssa;
   label = 6;
  } else {
   $$2 = $$035$lcssa;$$3 = 0;
  }
 }
 L8: do {
  if ((label|0) == 6) {
   $17 = HEAP8[$$035$lcssa65>>0]|0;
   $18 = $1&255;
   $19 = ($17<<24>>24)==($18<<24>>24);
   if ($19) {
    $$2 = $$035$lcssa65;$$3 = $$036$lcssa64;
   } else {
    $20 = Math_imul($3, 16843009)|0;
    $21 = ($$036$lcssa64>>>0)>(3);
    L11: do {
     if ($21) {
      $$046 = $$035$lcssa65;$$13745 = $$036$lcssa64;
      while(1) {
       $22 = HEAP32[$$046>>2]|0;
       $23 = $22 ^ $20;
       $24 = (($23) + -16843009)|0;
       $25 = $23 & -2139062144;
       $26 = $25 ^ -2139062144;
       $27 = $26 & $24;
       $28 = ($27|0)==(0);
       if (!($28)) {
        break;
       }
       $29 = ((($$046)) + 4|0);
       $30 = (($$13745) + -4)|0;
       $31 = ($30>>>0)>(3);
       if ($31) {
        $$046 = $29;$$13745 = $30;
       } else {
        $$0$lcssa = $29;$$137$lcssa = $30;
        label = 11;
        break L11;
       }
      }
      $$140 = $$046;$$23839 = $$13745;
     } else {
      $$0$lcssa = $$035$lcssa65;$$137$lcssa = $$036$lcssa64;
      label = 11;
     }
    } while(0);
    if ((label|0) == 11) {
     $32 = ($$137$lcssa|0)==(0);
     if ($32) {
      $$2 = $$0$lcssa;$$3 = 0;
      break;
     } else {
      $$140 = $$0$lcssa;$$23839 = $$137$lcssa;
     }
    }
    while(1) {
     $33 = HEAP8[$$140>>0]|0;
     $34 = ($33<<24>>24)==($18<<24>>24);
     if ($34) {
      $$2 = $$140;$$3 = $$23839;
      break L8;
     }
     $35 = ((($$140)) + 1|0);
     $36 = (($$23839) + -1)|0;
     $37 = ($36|0)==(0);
     if ($37) {
      $$2 = $35;$$3 = 0;
      break;
     } else {
      $$140 = $35;$$23839 = $36;
     }
    }
   }
  }
 } while(0);
 $38 = ($$3|0)!=(0);
 $39 = $38 ? $$2 : 0;
 return ($39|0);
}
function _strncmp($0,$1,$2) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 var $$0$lcssa = 0, $$01823 = 0, $$01925 = 0, $$01925$in = 0, $$020 = 0, $$024 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0;
 var $7 = 0, $8 = 0, $9 = 0, $or$cond = 0, $or$cond21 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $3 = ($2|0)==(0);
 if ($3) {
  $$020 = 0;
 } else {
  $4 = HEAP8[$0>>0]|0;
  $5 = ($4<<24>>24)==(0);
  L3: do {
   if ($5) {
    $$0$lcssa = $1;$16 = 0;
   } else {
    $$01823 = $0;$$01925$in = $2;$$024 = $1;$9 = $4;
    while(1) {
     $$01925 = (($$01925$in) + -1)|0;
     $6 = HEAP8[$$024>>0]|0;
     $7 = ($6<<24>>24)!=(0);
     $8 = ($$01925|0)!=(0);
     $or$cond = $8 & $7;
     $10 = ($9<<24>>24)==($6<<24>>24);
     $or$cond21 = $10 & $or$cond;
     if (!($or$cond21)) {
      $$0$lcssa = $$024;$16 = $9;
      break L3;
     }
     $11 = ((($$01823)) + 1|0);
     $12 = ((($$024)) + 1|0);
     $13 = HEAP8[$11>>0]|0;
     $14 = ($13<<24>>24)==(0);
     if ($14) {
      $$0$lcssa = $12;$16 = 0;
      break;
     } else {
      $$01823 = $11;$$01925$in = $$01925;$$024 = $12;$9 = $13;
     }
    }
   }
  } while(0);
  $15 = $16&255;
  $17 = HEAP8[$$0$lcssa>>0]|0;
  $18 = $17&255;
  $19 = (($15) - ($18))|0;
  $$020 = $19;
 }
 return ($$020|0);
}
function _strlen($0) {
 $0 = $0|0;
 var $$0 = 0, $$015$lcssa = 0, $$01519 = 0, $$1$lcssa = 0, $$pn = 0, $$pre = 0, $$sink = 0, $1 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0;
 var $21 = 0, $22 = 0, $23 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $1 = $0;
 $2 = $1 & 3;
 $3 = ($2|0)==(0);
 L1: do {
  if ($3) {
   $$015$lcssa = $0;
   label = 4;
  } else {
   $$01519 = $0;$23 = $1;
   while(1) {
    $4 = HEAP8[$$01519>>0]|0;
    $5 = ($4<<24>>24)==(0);
    if ($5) {
     $$sink = $23;
     break L1;
    }
    $6 = ((($$01519)) + 1|0);
    $7 = $6;
    $8 = $7 & 3;
    $9 = ($8|0)==(0);
    if ($9) {
     $$015$lcssa = $6;
     label = 4;
     break;
    } else {
     $$01519 = $6;$23 = $7;
    }
   }
  }
 } while(0);
 if ((label|0) == 4) {
  $$0 = $$015$lcssa;
  while(1) {
   $10 = HEAP32[$$0>>2]|0;
   $11 = (($10) + -16843009)|0;
   $12 = $10 & -2139062144;
   $13 = $12 ^ -2139062144;
   $14 = $13 & $11;
   $15 = ($14|0)==(0);
   $16 = ((($$0)) + 4|0);
   if ($15) {
    $$0 = $16;
   } else {
    break;
   }
  }
  $17 = $10&255;
  $18 = ($17<<24>>24)==(0);
  if ($18) {
   $$1$lcssa = $$0;
  } else {
   $$pn = $$0;
   while(1) {
    $19 = ((($$pn)) + 1|0);
    $$pre = HEAP8[$19>>0]|0;
    $20 = ($$pre<<24>>24)==(0);
    if ($20) {
     $$1$lcssa = $19;
     break;
    } else {
     $$pn = $19;
    }
   }
  }
  $21 = $$1$lcssa;
  $$sink = $21;
 }
 $22 = (($$sink) - ($1))|0;
 return ($22|0);
}
function _vfprintf($0,$1,$2) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 var $$ = 0, $$0 = 0, $$1 = 0, $$1$ = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0;
 var $26 = 0, $27 = 0, $28 = 0, $29 = 0, $3 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $4 = 0, $40 = 0, $5 = 0, $6 = 0, $7 = 0;
 var $8 = 0, $9 = 0, $vacopy_currentptr = 0, dest = 0, label = 0, sp = 0, stop = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 224|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(224|0);
 $3 = sp + 120|0;
 $4 = sp + 80|0;
 $5 = sp;
 $6 = sp + 136|0;
 dest=$4; stop=dest+40|0; do { HEAP32[dest>>2]=0|0; dest=dest+4|0; } while ((dest|0) < (stop|0));
 $vacopy_currentptr = HEAP32[$2>>2]|0;
 HEAP32[$3>>2] = $vacopy_currentptr;
 $7 = (_printf_core(0,$1,$3,$5,$4)|0);
 $8 = ($7|0)<(0);
 if ($8) {
  $$0 = -1;
 } else {
  $9 = ((($0)) + 76|0);
  $10 = HEAP32[$9>>2]|0;
  $11 = ($10|0)>(-1);
  if ($11) {
   $12 = (___lockfile($0)|0);
   $39 = $12;
  } else {
   $39 = 0;
  }
  $13 = HEAP32[$0>>2]|0;
  $14 = $13 & 32;
  $15 = ((($0)) + 74|0);
  $16 = HEAP8[$15>>0]|0;
  $17 = ($16<<24>>24)<(1);
  if ($17) {
   $18 = $13 & -33;
   HEAP32[$0>>2] = $18;
  }
  $19 = ((($0)) + 48|0);
  $20 = HEAP32[$19>>2]|0;
  $21 = ($20|0)==(0);
  if ($21) {
   $23 = ((($0)) + 44|0);
   $24 = HEAP32[$23>>2]|0;
   HEAP32[$23>>2] = $6;
   $25 = ((($0)) + 28|0);
   HEAP32[$25>>2] = $6;
   $26 = ((($0)) + 20|0);
   HEAP32[$26>>2] = $6;
   HEAP32[$19>>2] = 80;
   $27 = ((($6)) + 80|0);
   $28 = ((($0)) + 16|0);
   HEAP32[$28>>2] = $27;
   $29 = (_printf_core($0,$1,$3,$5,$4)|0);
   $30 = ($24|0)==(0|0);
   if ($30) {
    $$1 = $29;
   } else {
    $31 = ((($0)) + 36|0);
    $32 = HEAP32[$31>>2]|0;
    (FUNCTION_TABLE_iiii[$32 & 7]($0,0,0)|0);
    $33 = HEAP32[$26>>2]|0;
    $34 = ($33|0)==(0|0);
    $$ = $34 ? -1 : $29;
    HEAP32[$23>>2] = $24;
    HEAP32[$19>>2] = 0;
    HEAP32[$28>>2] = 0;
    HEAP32[$25>>2] = 0;
    HEAP32[$26>>2] = 0;
    $$1 = $$;
   }
  } else {
   $22 = (_printf_core($0,$1,$3,$5,$4)|0);
   $$1 = $22;
  }
  $35 = HEAP32[$0>>2]|0;
  $36 = $35 & 32;
  $37 = ($36|0)==(0);
  $$1$ = $37 ? $$1 : -1;
  $38 = $35 | $14;
  HEAP32[$0>>2] = $38;
  $40 = ($39|0)==(0);
  if (!($40)) {
   ___unlockfile($0);
  }
  $$0 = $$1$;
 }
 STACKTOP = sp;return ($$0|0);
}
function _printf_core($0,$1,$2,$3,$4) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 $3 = $3|0;
 $4 = $4|0;
 var $$ = 0, $$$ = 0, $$$0259 = 0, $$$0262 = 0, $$$4266 = 0, $$$5 = 0, $$0 = 0, $$0228 = 0, $$0228$ = 0, $$0229316 = 0, $$0232 = 0, $$0235 = 0, $$0237 = 0, $$0240$lcssa = 0, $$0240$lcssa356 = 0, $$0240315 = 0, $$0243 = 0, $$0247 = 0, $$0249$lcssa = 0, $$0249303 = 0;
 var $$0252 = 0, $$0253 = 0, $$0254 = 0, $$0254$$0254$ = 0, $$0259 = 0, $$0262$lcssa = 0, $$0262309 = 0, $$0269 = 0, $$0269$phi = 0, $$1 = 0, $$1230327 = 0, $$1233 = 0, $$1236 = 0, $$1238 = 0, $$1241326 = 0, $$1244314 = 0, $$1248 = 0, $$1250 = 0, $$1255 = 0, $$1260 = 0;
 var $$1263 = 0, $$1263$ = 0, $$1270 = 0, $$2 = 0, $$2234 = 0, $$2239 = 0, $$2242$lcssa = 0, $$2242302 = 0, $$2245 = 0, $$2251 = 0, $$2256 = 0, $$2256$ = 0, $$2256$$$2256 = 0, $$2261 = 0, $$2271 = 0, $$279$ = 0, $$286 = 0, $$287 = 0, $$3257 = 0, $$3265 = 0;
 var $$3272 = 0, $$3300 = 0, $$4258354 = 0, $$4266 = 0, $$5 = 0, $$6268 = 0, $$lcssa291 = 0, $$lcssa292 = 0, $$pre = 0, $$pre342 = 0, $$pre344 = 0, $$pre345 = 0, $$pre345$pre = 0, $$pre346 = 0, $$pre348 = 0, $$sink = 0, $10 = 0, $100 = 0, $101 = 0, $102 = 0;
 var $103 = 0, $104 = 0, $105 = 0, $106 = 0, $107 = 0, $108 = 0, $109 = 0, $11 = 0, $110 = 0, $111 = 0, $112 = 0, $113 = 0, $114 = 0, $115 = 0, $116 = 0, $117 = 0, $118 = 0, $119 = 0, $12 = 0, $120 = 0;
 var $121 = 0, $122 = 0, $123 = 0, $124 = 0, $125 = 0, $126 = 0, $127 = 0, $128 = 0, $129 = 0, $13 = 0, $130 = 0, $131 = 0, $132 = 0, $133 = 0, $134 = 0, $135 = 0, $136 = 0, $137 = 0, $138 = 0, $139 = 0;
 var $14 = 0, $140 = 0, $141 = 0, $142 = 0, $143 = 0, $144 = 0, $145 = 0, $146 = 0, $147 = 0, $148 = 0, $149 = 0, $15 = 0, $150 = 0, $151 = 0, $152 = 0, $153 = 0, $154 = 0, $155 = 0, $156 = 0, $157 = 0;
 var $158 = 0, $159 = 0, $16 = 0, $160 = 0, $161 = 0, $162 = 0, $163 = 0, $164 = 0, $165 = 0, $166 = 0, $167 = 0, $168 = 0, $169 = 0, $17 = 0, $170 = 0, $171 = 0, $172 = 0, $173 = 0, $174 = 0, $175 = 0;
 var $176 = 0, $177 = 0, $178 = 0, $179 = 0, $18 = 0, $180 = 0, $181 = 0, $182 = 0, $183 = 0, $184 = 0, $185 = 0, $186 = 0, $187 = 0, $188 = 0, $189 = 0, $19 = 0, $190 = 0, $191 = 0, $192 = 0, $193 = 0;
 var $194 = 0, $195 = 0, $196 = 0, $197 = 0, $198 = 0, $199 = 0, $20 = 0, $200 = 0, $201 = 0, $202 = 0, $203 = 0, $204 = 0, $205 = 0, $206 = 0, $207 = 0, $208 = 0, $209 = 0, $21 = 0, $210 = 0, $211 = 0;
 var $212 = 0, $213 = 0, $214 = 0, $215 = 0, $216 = 0, $217 = 0, $218 = 0, $219 = 0, $22 = 0, $220 = 0, $221 = 0, $222 = 0, $223 = 0, $224 = 0, $225 = 0, $226 = 0, $227 = 0, $228 = 0, $229 = 0, $23 = 0;
 var $230 = 0, $231 = 0, $232 = 0, $233 = 0, $234 = 0, $235 = 0, $236 = 0, $237 = 0, $238 = 0, $239 = 0, $24 = 0, $240 = 0, $241 = 0, $242 = 0, $243 = 0, $244 = 0, $245 = 0, $246 = 0, $247 = 0, $248 = 0;
 var $249 = 0, $25 = 0, $250 = 0, $251 = 0, $252 = 0, $253 = 0, $254 = 0, $255 = 0, $256 = 0, $257 = 0, $258 = 0, $259 = 0, $26 = 0, $260 = 0, $261 = 0, $262 = 0, $263 = 0, $264 = 0, $265 = 0, $266 = 0;
 var $267 = 0, $268 = 0, $269 = 0, $27 = 0, $270 = 0, $271 = 0, $272 = 0, $273 = 0, $274 = 0, $275 = 0, $276 = 0, $277 = 0, $278 = 0, $279 = 0, $28 = 0, $280 = 0, $281 = 0, $282 = 0, $283 = 0, $284 = 0;
 var $285 = 0, $286 = 0, $287 = 0, $288 = 0, $289 = 0, $29 = 0, $290 = 0, $291 = 0, $292 = 0, $293 = 0, $294 = 0, $295 = 0, $296 = 0, $297 = 0, $298 = 0, $299 = 0, $30 = 0, $300 = 0, $301 = 0, $302 = 0;
 var $303 = 0, $304 = 0, $305 = 0, $306 = 0, $307 = 0, $308 = 0, $309 = 0, $31 = 0, $310 = 0, $311 = 0, $312 = 0, $313 = 0, $314 = 0, $315 = 0, $316 = 0, $317 = 0, $318 = 0, $319 = 0, $32 = 0, $320 = 0;
 var $321 = 0, $322 = 0, $323 = 0, $324 = 0, $325 = 0, $326 = 0, $327 = 0, $328 = 0, $329 = 0, $33 = 0, $330 = 0, $331 = 0, $332 = 0, $333 = 0, $334 = 0, $335 = 0, $336 = 0, $337 = 0, $338 = 0, $339 = 0.0;
 var $34 = 0, $340 = 0, $341 = 0, $342 = 0, $343 = 0, $344 = 0, $345 = 0, $346 = 0, $347 = 0, $348 = 0, $349 = 0, $35 = 0, $350 = 0, $351 = 0, $352 = 0, $353 = 0, $354 = 0, $355 = 0, $356 = 0, $357 = 0;
 var $358 = 0, $359 = 0, $36 = 0, $360 = 0, $361 = 0, $362 = 0, $363 = 0, $364 = 0, $365 = 0, $37 = 0, $38 = 0, $39 = 0, $40 = 0, $41 = 0, $42 = 0, $43 = 0, $44 = 0, $45 = 0, $46 = 0, $47 = 0;
 var $48 = 0, $49 = 0, $5 = 0, $50 = 0, $51 = 0, $52 = 0, $53 = 0, $54 = 0, $55 = 0, $56 = 0, $57 = 0, $58 = 0, $59 = 0, $6 = 0, $60 = 0, $61 = 0, $62 = 0, $63 = 0, $64 = 0, $65 = 0;
 var $66 = 0, $67 = 0, $68 = 0, $69 = 0, $7 = 0, $70 = 0, $71 = 0, $72 = 0, $73 = 0, $74 = 0, $75 = 0, $76 = 0, $77 = 0, $78 = 0, $79 = 0, $8 = 0, $80 = 0, $81 = 0, $82 = 0, $83 = 0;
 var $84 = 0, $85 = 0, $86 = 0, $87 = 0, $88 = 0, $89 = 0, $9 = 0, $90 = 0, $91 = 0, $92 = 0, $93 = 0, $94 = 0, $95 = 0, $96 = 0, $97 = 0, $98 = 0, $99 = 0, $arglist_current = 0, $arglist_current2 = 0, $arglist_next = 0;
 var $arglist_next3 = 0, $brmerge = 0, $brmerge308 = 0, $expanded = 0, $expanded10 = 0, $expanded11 = 0, $expanded13 = 0, $expanded14 = 0, $expanded15 = 0, $expanded4 = 0, $expanded6 = 0, $expanded7 = 0, $expanded8 = 0, $or$cond = 0, $or$cond276 = 0, $or$cond278 = 0, $or$cond281 = 0, $storemerge274 = 0, $trunc = 0, label = 0;
 var sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 64|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(64|0);
 $5 = sp + 16|0;
 $6 = sp;
 $7 = sp + 24|0;
 $8 = sp + 8|0;
 $9 = sp + 20|0;
 HEAP32[$5>>2] = $1;
 $10 = ($0|0)!=(0|0);
 $11 = ((($7)) + 40|0);
 $12 = $11;
 $13 = ((($7)) + 39|0);
 $14 = ((($8)) + 4|0);
 $$0243 = 0;$$0247 = 0;$$0269 = 0;
 L1: while(1) {
  $15 = ($$0247|0)>(-1);
  do {
   if ($15) {
    $16 = (2147483647 - ($$0247))|0;
    $17 = ($$0243|0)>($16|0);
    if ($17) {
     $18 = (___errno_location()|0);
     HEAP32[$18>>2] = 75;
     $$1248 = -1;
     break;
    } else {
     $19 = (($$0243) + ($$0247))|0;
     $$1248 = $19;
     break;
    }
   } else {
    $$1248 = $$0247;
   }
  } while(0);
  $20 = HEAP32[$5>>2]|0;
  $21 = HEAP8[$20>>0]|0;
  $22 = ($21<<24>>24)==(0);
  if ($22) {
   label = 88;
   break;
  } else {
   $23 = $21;$25 = $20;
  }
  L9: while(1) {
   switch ($23<<24>>24) {
   case 37:  {
    $$0249303 = $25;$27 = $25;
    label = 9;
    break L9;
    break;
   }
   case 0:  {
    $$0249$lcssa = $25;
    break L9;
    break;
   }
   default: {
   }
   }
   $24 = ((($25)) + 1|0);
   HEAP32[$5>>2] = $24;
   $$pre = HEAP8[$24>>0]|0;
   $23 = $$pre;$25 = $24;
  }
  L12: do {
   if ((label|0) == 9) {
    while(1) {
     label = 0;
     $26 = ((($27)) + 1|0);
     $28 = HEAP8[$26>>0]|0;
     $29 = ($28<<24>>24)==(37);
     if (!($29)) {
      $$0249$lcssa = $$0249303;
      break L12;
     }
     $30 = ((($$0249303)) + 1|0);
     $31 = ((($27)) + 2|0);
     HEAP32[$5>>2] = $31;
     $32 = HEAP8[$31>>0]|0;
     $33 = ($32<<24>>24)==(37);
     if ($33) {
      $$0249303 = $30;$27 = $31;
      label = 9;
     } else {
      $$0249$lcssa = $30;
      break;
     }
    }
   }
  } while(0);
  $34 = $$0249$lcssa;
  $35 = $20;
  $36 = (($34) - ($35))|0;
  if ($10) {
   _out_228($0,$20,$36);
  }
  $37 = ($36|0)==(0);
  if (!($37)) {
   $$0269$phi = $$0269;$$0243 = $36;$$0247 = $$1248;$$0269 = $$0269$phi;
   continue;
  }
  $38 = HEAP32[$5>>2]|0;
  $39 = ((($38)) + 1|0);
  $40 = HEAP8[$39>>0]|0;
  $41 = $40 << 24 >> 24;
  $42 = (_isdigit($41)|0);
  $43 = ($42|0)==(0);
  $$pre342 = HEAP32[$5>>2]|0;
  if ($43) {
   $$0253 = -1;$$1270 = $$0269;$$sink = 1;
  } else {
   $44 = ((($$pre342)) + 2|0);
   $45 = HEAP8[$44>>0]|0;
   $46 = ($45<<24>>24)==(36);
   if ($46) {
    $47 = ((($$pre342)) + 1|0);
    $48 = HEAP8[$47>>0]|0;
    $49 = $48 << 24 >> 24;
    $50 = (($49) + -48)|0;
    $$0253 = $50;$$1270 = 1;$$sink = 3;
   } else {
    $$0253 = -1;$$1270 = $$0269;$$sink = 1;
   }
  }
  $51 = (($$pre342) + ($$sink)|0);
  HEAP32[$5>>2] = $51;
  $52 = HEAP8[$51>>0]|0;
  $53 = $52 << 24 >> 24;
  $54 = (($53) + -32)|0;
  $55 = ($54>>>0)>(31);
  $56 = 1 << $54;
  $57 = $56 & 75913;
  $58 = ($57|0)==(0);
  $brmerge308 = $55 | $58;
  if ($brmerge308) {
   $$0262$lcssa = 0;$$lcssa291 = $52;$$lcssa292 = $51;
  } else {
   $$0262309 = 0;$60 = $52;$65 = $51;
   while(1) {
    $59 = $60 << 24 >> 24;
    $61 = (($59) + -32)|0;
    $62 = 1 << $61;
    $63 = $62 | $$0262309;
    $64 = ((($65)) + 1|0);
    HEAP32[$5>>2] = $64;
    $66 = HEAP8[$64>>0]|0;
    $67 = $66 << 24 >> 24;
    $68 = (($67) + -32)|0;
    $69 = ($68>>>0)>(31);
    $70 = 1 << $68;
    $71 = $70 & 75913;
    $72 = ($71|0)==(0);
    $brmerge = $69 | $72;
    if ($brmerge) {
     $$0262$lcssa = $63;$$lcssa291 = $66;$$lcssa292 = $64;
     break;
    } else {
     $$0262309 = $63;$60 = $66;$65 = $64;
    }
   }
  }
  $73 = ($$lcssa291<<24>>24)==(42);
  if ($73) {
   $74 = ((($$lcssa292)) + 1|0);
   $75 = HEAP8[$74>>0]|0;
   $76 = $75 << 24 >> 24;
   $77 = (_isdigit($76)|0);
   $78 = ($77|0)==(0);
   if ($78) {
    label = 23;
   } else {
    $79 = HEAP32[$5>>2]|0;
    $80 = ((($79)) + 2|0);
    $81 = HEAP8[$80>>0]|0;
    $82 = ($81<<24>>24)==(36);
    if ($82) {
     $83 = ((($79)) + 1|0);
     $84 = HEAP8[$83>>0]|0;
     $85 = $84 << 24 >> 24;
     $86 = (($85) + -48)|0;
     $87 = (($4) + ($86<<2)|0);
     HEAP32[$87>>2] = 10;
     $88 = HEAP8[$83>>0]|0;
     $89 = $88 << 24 >> 24;
     $90 = (($89) + -48)|0;
     $91 = (($3) + ($90<<3)|0);
     $92 = $91;
     $93 = $92;
     $94 = HEAP32[$93>>2]|0;
     $95 = (($92) + 4)|0;
     $96 = $95;
     $97 = HEAP32[$96>>2]|0;
     $98 = ((($79)) + 3|0);
     $$0259 = $94;$$2271 = 1;$storemerge274 = $98;
    } else {
     label = 23;
    }
   }
   if ((label|0) == 23) {
    label = 0;
    $99 = ($$1270|0)==(0);
    if (!($99)) {
     $$0 = -1;
     break;
    }
    if ($10) {
     $arglist_current = HEAP32[$2>>2]|0;
     $100 = $arglist_current;
     $101 = ((0) + 4|0);
     $expanded4 = $101;
     $expanded = (($expanded4) - 1)|0;
     $102 = (($100) + ($expanded))|0;
     $103 = ((0) + 4|0);
     $expanded8 = $103;
     $expanded7 = (($expanded8) - 1)|0;
     $expanded6 = $expanded7 ^ -1;
     $104 = $102 & $expanded6;
     $105 = $104;
     $106 = HEAP32[$105>>2]|0;
     $arglist_next = ((($105)) + 4|0);
     HEAP32[$2>>2] = $arglist_next;
     $363 = $106;
    } else {
     $363 = 0;
    }
    $107 = HEAP32[$5>>2]|0;
    $108 = ((($107)) + 1|0);
    $$0259 = $363;$$2271 = 0;$storemerge274 = $108;
   }
   HEAP32[$5>>2] = $storemerge274;
   $109 = ($$0259|0)<(0);
   $110 = $$0262$lcssa | 8192;
   $111 = (0 - ($$0259))|0;
   $$$0262 = $109 ? $110 : $$0262$lcssa;
   $$$0259 = $109 ? $111 : $$0259;
   $$1260 = $$$0259;$$1263 = $$$0262;$$3272 = $$2271;$115 = $storemerge274;
  } else {
   $112 = (_getint_229($5)|0);
   $113 = ($112|0)<(0);
   if ($113) {
    $$0 = -1;
    break;
   }
   $$pre344 = HEAP32[$5>>2]|0;
   $$1260 = $112;$$1263 = $$0262$lcssa;$$3272 = $$1270;$115 = $$pre344;
  }
  $114 = HEAP8[$115>>0]|0;
  $116 = ($114<<24>>24)==(46);
  do {
   if ($116) {
    $117 = ((($115)) + 1|0);
    $118 = HEAP8[$117>>0]|0;
    $119 = ($118<<24>>24)==(42);
    if (!($119)) {
     $155 = ((($115)) + 1|0);
     HEAP32[$5>>2] = $155;
     $156 = (_getint_229($5)|0);
     $$pre345$pre = HEAP32[$5>>2]|0;
     $$0254 = $156;$$pre345 = $$pre345$pre;
     break;
    }
    $120 = ((($115)) + 2|0);
    $121 = HEAP8[$120>>0]|0;
    $122 = $121 << 24 >> 24;
    $123 = (_isdigit($122)|0);
    $124 = ($123|0)==(0);
    if (!($124)) {
     $125 = HEAP32[$5>>2]|0;
     $126 = ((($125)) + 3|0);
     $127 = HEAP8[$126>>0]|0;
     $128 = ($127<<24>>24)==(36);
     if ($128) {
      $129 = ((($125)) + 2|0);
      $130 = HEAP8[$129>>0]|0;
      $131 = $130 << 24 >> 24;
      $132 = (($131) + -48)|0;
      $133 = (($4) + ($132<<2)|0);
      HEAP32[$133>>2] = 10;
      $134 = HEAP8[$129>>0]|0;
      $135 = $134 << 24 >> 24;
      $136 = (($135) + -48)|0;
      $137 = (($3) + ($136<<3)|0);
      $138 = $137;
      $139 = $138;
      $140 = HEAP32[$139>>2]|0;
      $141 = (($138) + 4)|0;
      $142 = $141;
      $143 = HEAP32[$142>>2]|0;
      $144 = ((($125)) + 4|0);
      HEAP32[$5>>2] = $144;
      $$0254 = $140;$$pre345 = $144;
      break;
     }
    }
    $145 = ($$3272|0)==(0);
    if (!($145)) {
     $$0 = -1;
     break L1;
    }
    if ($10) {
     $arglist_current2 = HEAP32[$2>>2]|0;
     $146 = $arglist_current2;
     $147 = ((0) + 4|0);
     $expanded11 = $147;
     $expanded10 = (($expanded11) - 1)|0;
     $148 = (($146) + ($expanded10))|0;
     $149 = ((0) + 4|0);
     $expanded15 = $149;
     $expanded14 = (($expanded15) - 1)|0;
     $expanded13 = $expanded14 ^ -1;
     $150 = $148 & $expanded13;
     $151 = $150;
     $152 = HEAP32[$151>>2]|0;
     $arglist_next3 = ((($151)) + 4|0);
     HEAP32[$2>>2] = $arglist_next3;
     $364 = $152;
    } else {
     $364 = 0;
    }
    $153 = HEAP32[$5>>2]|0;
    $154 = ((($153)) + 2|0);
    HEAP32[$5>>2] = $154;
    $$0254 = $364;$$pre345 = $154;
   } else {
    $$0254 = -1;$$pre345 = $115;
   }
  } while(0);
  $$0252 = 0;$158 = $$pre345;
  while(1) {
   $157 = HEAP8[$158>>0]|0;
   $159 = $157 << 24 >> 24;
   $160 = (($159) + -65)|0;
   $161 = ($160>>>0)>(57);
   if ($161) {
    $$0 = -1;
    break L1;
   }
   $162 = ((($158)) + 1|0);
   HEAP32[$5>>2] = $162;
   $163 = HEAP8[$158>>0]|0;
   $164 = $163 << 24 >> 24;
   $165 = (($164) + -65)|0;
   $166 = ((8139 + (($$0252*58)|0)|0) + ($165)|0);
   $167 = HEAP8[$166>>0]|0;
   $168 = $167&255;
   $169 = (($168) + -1)|0;
   $170 = ($169>>>0)<(8);
   if ($170) {
    $$0252 = $168;$158 = $162;
   } else {
    break;
   }
  }
  $171 = ($167<<24>>24)==(0);
  if ($171) {
   $$0 = -1;
   break;
  }
  $172 = ($167<<24>>24)==(19);
  $173 = ($$0253|0)>(-1);
  do {
   if ($172) {
    if ($173) {
     $$0 = -1;
     break L1;
    } else {
     label = 50;
    }
   } else {
    if ($173) {
     $174 = (($4) + ($$0253<<2)|0);
     HEAP32[$174>>2] = $168;
     $175 = (($3) + ($$0253<<3)|0);
     $176 = $175;
     $177 = $176;
     $178 = HEAP32[$177>>2]|0;
     $179 = (($176) + 4)|0;
     $180 = $179;
     $181 = HEAP32[$180>>2]|0;
     $182 = $6;
     $183 = $182;
     HEAP32[$183>>2] = $178;
     $184 = (($182) + 4)|0;
     $185 = $184;
     HEAP32[$185>>2] = $181;
     label = 50;
     break;
    }
    if (!($10)) {
     $$0 = 0;
     break L1;
    }
    _pop_arg_231($6,$168,$2);
    $$pre346 = HEAP32[$5>>2]|0;
    $187 = $$pre346;
   }
  } while(0);
  if ((label|0) == 50) {
   label = 0;
   if ($10) {
    $187 = $162;
   } else {
    $$0243 = 0;$$0247 = $$1248;$$0269 = $$3272;
    continue;
   }
  }
  $186 = ((($187)) + -1|0);
  $188 = HEAP8[$186>>0]|0;
  $189 = $188 << 24 >> 24;
  $190 = ($$0252|0)!=(0);
  $191 = $189 & 15;
  $192 = ($191|0)==(3);
  $or$cond276 = $190 & $192;
  $193 = $189 & -33;
  $$0235 = $or$cond276 ? $193 : $189;
  $194 = $$1263 & 8192;
  $195 = ($194|0)==(0);
  $196 = $$1263 & -65537;
  $$1263$ = $195 ? $$1263 : $196;
  L73: do {
   switch ($$0235|0) {
   case 110:  {
    $trunc = $$0252&255;
    switch ($trunc<<24>>24) {
    case 0:  {
     $203 = HEAP32[$6>>2]|0;
     HEAP32[$203>>2] = $$1248;
     $$0243 = 0;$$0247 = $$1248;$$0269 = $$3272;
     continue L1;
     break;
    }
    case 1:  {
     $204 = HEAP32[$6>>2]|0;
     HEAP32[$204>>2] = $$1248;
     $$0243 = 0;$$0247 = $$1248;$$0269 = $$3272;
     continue L1;
     break;
    }
    case 2:  {
     $205 = ($$1248|0)<(0);
     $206 = $205 << 31 >> 31;
     $207 = HEAP32[$6>>2]|0;
     $208 = $207;
     $209 = $208;
     HEAP32[$209>>2] = $$1248;
     $210 = (($208) + 4)|0;
     $211 = $210;
     HEAP32[$211>>2] = $206;
     $$0243 = 0;$$0247 = $$1248;$$0269 = $$3272;
     continue L1;
     break;
    }
    case 3:  {
     $212 = $$1248&65535;
     $213 = HEAP32[$6>>2]|0;
     HEAP16[$213>>1] = $212;
     $$0243 = 0;$$0247 = $$1248;$$0269 = $$3272;
     continue L1;
     break;
    }
    case 4:  {
     $214 = $$1248&255;
     $215 = HEAP32[$6>>2]|0;
     HEAP8[$215>>0] = $214;
     $$0243 = 0;$$0247 = $$1248;$$0269 = $$3272;
     continue L1;
     break;
    }
    case 6:  {
     $216 = HEAP32[$6>>2]|0;
     HEAP32[$216>>2] = $$1248;
     $$0243 = 0;$$0247 = $$1248;$$0269 = $$3272;
     continue L1;
     break;
    }
    case 7:  {
     $217 = ($$1248|0)<(0);
     $218 = $217 << 31 >> 31;
     $219 = HEAP32[$6>>2]|0;
     $220 = $219;
     $221 = $220;
     HEAP32[$221>>2] = $$1248;
     $222 = (($220) + 4)|0;
     $223 = $222;
     HEAP32[$223>>2] = $218;
     $$0243 = 0;$$0247 = $$1248;$$0269 = $$3272;
     continue L1;
     break;
    }
    default: {
     $$0243 = 0;$$0247 = $$1248;$$0269 = $$3272;
     continue L1;
    }
    }
    break;
   }
   case 112:  {
    $224 = ($$0254>>>0)>(8);
    $225 = $224 ? $$0254 : 8;
    $226 = $$1263$ | 8;
    $$1236 = 120;$$1255 = $225;$$3265 = $226;
    label = 62;
    break;
   }
   case 88: case 120:  {
    $$1236 = $$0235;$$1255 = $$0254;$$3265 = $$1263$;
    label = 62;
    break;
   }
   case 111:  {
    $242 = $6;
    $243 = $242;
    $244 = HEAP32[$243>>2]|0;
    $245 = (($242) + 4)|0;
    $246 = $245;
    $247 = HEAP32[$246>>2]|0;
    $248 = (_fmt_o($244,$247,$11)|0);
    $249 = $$1263$ & 8;
    $250 = ($249|0)==(0);
    $251 = $248;
    $252 = (($12) - ($251))|0;
    $253 = ($$0254|0)>($252|0);
    $254 = (($252) + 1)|0;
    $255 = $250 | $253;
    $$0254$$0254$ = $255 ? $$0254 : $254;
    $$0228 = $248;$$1233 = 0;$$1238 = 8603;$$2256 = $$0254$$0254$;$$4266 = $$1263$;$280 = $244;$282 = $247;
    label = 68;
    break;
   }
   case 105: case 100:  {
    $256 = $6;
    $257 = $256;
    $258 = HEAP32[$257>>2]|0;
    $259 = (($256) + 4)|0;
    $260 = $259;
    $261 = HEAP32[$260>>2]|0;
    $262 = ($261|0)<(0);
    if ($262) {
     $263 = (_i64Subtract(0,0,($258|0),($261|0))|0);
     $264 = tempRet0;
     $265 = $6;
     $266 = $265;
     HEAP32[$266>>2] = $263;
     $267 = (($265) + 4)|0;
     $268 = $267;
     HEAP32[$268>>2] = $264;
     $$0232 = 1;$$0237 = 8603;$275 = $263;$276 = $264;
     label = 67;
     break L73;
    } else {
     $269 = $$1263$ & 2048;
     $270 = ($269|0)==(0);
     $271 = $$1263$ & 1;
     $272 = ($271|0)==(0);
     $$ = $272 ? 8603 : (8605);
     $$$ = $270 ? $$ : (8604);
     $273 = $$1263$ & 2049;
     $274 = ($273|0)!=(0);
     $$279$ = $274&1;
     $$0232 = $$279$;$$0237 = $$$;$275 = $258;$276 = $261;
     label = 67;
     break L73;
    }
    break;
   }
   case 117:  {
    $197 = $6;
    $198 = $197;
    $199 = HEAP32[$198>>2]|0;
    $200 = (($197) + 4)|0;
    $201 = $200;
    $202 = HEAP32[$201>>2]|0;
    $$0232 = 0;$$0237 = 8603;$275 = $199;$276 = $202;
    label = 67;
    break;
   }
   case 99:  {
    $292 = $6;
    $293 = $292;
    $294 = HEAP32[$293>>2]|0;
    $295 = (($292) + 4)|0;
    $296 = $295;
    $297 = HEAP32[$296>>2]|0;
    $298 = $294&255;
    HEAP8[$13>>0] = $298;
    $$2 = $13;$$2234 = 0;$$2239 = 8603;$$2251 = $11;$$5 = 1;$$6268 = $196;
    break;
   }
   case 109:  {
    $299 = (___errno_location()|0);
    $300 = HEAP32[$299>>2]|0;
    $301 = (_strerror($300)|0);
    $$1 = $301;
    label = 72;
    break;
   }
   case 115:  {
    $302 = HEAP32[$6>>2]|0;
    $303 = ($302|0)!=(0|0);
    $304 = $303 ? $302 : 8613;
    $$1 = $304;
    label = 72;
    break;
   }
   case 67:  {
    $311 = $6;
    $312 = $311;
    $313 = HEAP32[$312>>2]|0;
    $314 = (($311) + 4)|0;
    $315 = $314;
    $316 = HEAP32[$315>>2]|0;
    HEAP32[$8>>2] = $313;
    HEAP32[$14>>2] = 0;
    HEAP32[$6>>2] = $8;
    $$4258354 = -1;$365 = $8;
    label = 76;
    break;
   }
   case 83:  {
    $$pre348 = HEAP32[$6>>2]|0;
    $317 = ($$0254|0)==(0);
    if ($317) {
     _pad_234($0,32,$$1260,0,$$1263$);
     $$0240$lcssa356 = 0;
     label = 85;
    } else {
     $$4258354 = $$0254;$365 = $$pre348;
     label = 76;
    }
    break;
   }
   case 65: case 71: case 70: case 69: case 97: case 103: case 102: case 101:  {
    $339 = +HEAPF64[$6>>3];
    $340 = (_fmt_fp($0,$339,$$1260,$$0254,$$1263$,$$0235)|0);
    $$0243 = $340;$$0247 = $$1248;$$0269 = $$3272;
    continue L1;
    break;
   }
   default: {
    $$2 = $20;$$2234 = 0;$$2239 = 8603;$$2251 = $11;$$5 = $$0254;$$6268 = $$1263$;
   }
   }
  } while(0);
  L97: do {
   if ((label|0) == 62) {
    label = 0;
    $227 = $6;
    $228 = $227;
    $229 = HEAP32[$228>>2]|0;
    $230 = (($227) + 4)|0;
    $231 = $230;
    $232 = HEAP32[$231>>2]|0;
    $233 = $$1236 & 32;
    $234 = (_fmt_x($229,$232,$11,$233)|0);
    $235 = ($229|0)==(0);
    $236 = ($232|0)==(0);
    $237 = $235 & $236;
    $238 = $$3265 & 8;
    $239 = ($238|0)==(0);
    $or$cond278 = $239 | $237;
    $240 = $$1236 >> 4;
    $241 = (8603 + ($240)|0);
    $$286 = $or$cond278 ? 8603 : $241;
    $$287 = $or$cond278 ? 0 : 2;
    $$0228 = $234;$$1233 = $$287;$$1238 = $$286;$$2256 = $$1255;$$4266 = $$3265;$280 = $229;$282 = $232;
    label = 68;
   }
   else if ((label|0) == 67) {
    label = 0;
    $277 = (_fmt_u($275,$276,$11)|0);
    $$0228 = $277;$$1233 = $$0232;$$1238 = $$0237;$$2256 = $$0254;$$4266 = $$1263$;$280 = $275;$282 = $276;
    label = 68;
   }
   else if ((label|0) == 72) {
    label = 0;
    $305 = (_memchr($$1,0,$$0254)|0);
    $306 = ($305|0)==(0|0);
    $307 = $305;
    $308 = $$1;
    $309 = (($307) - ($308))|0;
    $310 = (($$1) + ($$0254)|0);
    $$3257 = $306 ? $$0254 : $309;
    $$1250 = $306 ? $310 : $305;
    $$2 = $$1;$$2234 = 0;$$2239 = 8603;$$2251 = $$1250;$$5 = $$3257;$$6268 = $196;
   }
   else if ((label|0) == 76) {
    label = 0;
    $$0229316 = $365;$$0240315 = 0;$$1244314 = 0;
    while(1) {
     $318 = HEAP32[$$0229316>>2]|0;
     $319 = ($318|0)==(0);
     if ($319) {
      $$0240$lcssa = $$0240315;$$2245 = $$1244314;
      break;
     }
     $320 = (_wctomb($9,$318)|0);
     $321 = ($320|0)<(0);
     $322 = (($$4258354) - ($$0240315))|0;
     $323 = ($320>>>0)>($322>>>0);
     $or$cond281 = $321 | $323;
     if ($or$cond281) {
      $$0240$lcssa = $$0240315;$$2245 = $320;
      break;
     }
     $324 = ((($$0229316)) + 4|0);
     $325 = (($320) + ($$0240315))|0;
     $326 = ($$4258354>>>0)>($325>>>0);
     if ($326) {
      $$0229316 = $324;$$0240315 = $325;$$1244314 = $320;
     } else {
      $$0240$lcssa = $325;$$2245 = $320;
      break;
     }
    }
    $327 = ($$2245|0)<(0);
    if ($327) {
     $$0 = -1;
     break L1;
    }
    _pad_234($0,32,$$1260,$$0240$lcssa,$$1263$);
    $328 = ($$0240$lcssa|0)==(0);
    if ($328) {
     $$0240$lcssa356 = 0;
     label = 85;
    } else {
     $$1230327 = $365;$$1241326 = 0;
     while(1) {
      $329 = HEAP32[$$1230327>>2]|0;
      $330 = ($329|0)==(0);
      if ($330) {
       $$0240$lcssa356 = $$0240$lcssa;
       label = 85;
       break L97;
      }
      $331 = (_wctomb($9,$329)|0);
      $332 = (($331) + ($$1241326))|0;
      $333 = ($332|0)>($$0240$lcssa|0);
      if ($333) {
       $$0240$lcssa356 = $$0240$lcssa;
       label = 85;
       break L97;
      }
      $334 = ((($$1230327)) + 4|0);
      _out_228($0,$9,$331);
      $335 = ($332>>>0)<($$0240$lcssa>>>0);
      if ($335) {
       $$1230327 = $334;$$1241326 = $332;
      } else {
       $$0240$lcssa356 = $$0240$lcssa;
       label = 85;
       break;
      }
     }
    }
   }
  } while(0);
  if ((label|0) == 68) {
   label = 0;
   $278 = ($$2256|0)>(-1);
   $279 = $$4266 & -65537;
   $$$4266 = $278 ? $279 : $$4266;
   $281 = ($280|0)!=(0);
   $283 = ($282|0)!=(0);
   $284 = $281 | $283;
   $285 = ($$2256|0)!=(0);
   $or$cond = $285 | $284;
   $286 = $$0228;
   $287 = (($12) - ($286))|0;
   $288 = $284 ^ 1;
   $289 = $288&1;
   $290 = (($287) + ($289))|0;
   $291 = ($$2256|0)>($290|0);
   $$2256$ = $291 ? $$2256 : $290;
   $$2256$$$2256 = $or$cond ? $$2256$ : $$2256;
   $$0228$ = $or$cond ? $$0228 : $11;
   $$2 = $$0228$;$$2234 = $$1233;$$2239 = $$1238;$$2251 = $11;$$5 = $$2256$$$2256;$$6268 = $$$4266;
  }
  else if ((label|0) == 85) {
   label = 0;
   $336 = $$1263$ ^ 8192;
   _pad_234($0,32,$$1260,$$0240$lcssa356,$336);
   $337 = ($$1260|0)>($$0240$lcssa356|0);
   $338 = $337 ? $$1260 : $$0240$lcssa356;
   $$0243 = $338;$$0247 = $$1248;$$0269 = $$3272;
   continue;
  }
  $341 = $$2251;
  $342 = $$2;
  $343 = (($341) - ($342))|0;
  $344 = ($$5|0)<($343|0);
  $$$5 = $344 ? $343 : $$5;
  $345 = (($$$5) + ($$2234))|0;
  $346 = ($$1260|0)<($345|0);
  $$2261 = $346 ? $345 : $$1260;
  _pad_234($0,32,$$2261,$345,$$6268);
  _out_228($0,$$2239,$$2234);
  $347 = $$6268 ^ 65536;
  _pad_234($0,48,$$2261,$345,$347);
  _pad_234($0,48,$$$5,$343,0);
  _out_228($0,$$2,$343);
  $348 = $$6268 ^ 8192;
  _pad_234($0,32,$$2261,$345,$348);
  $$0243 = $$2261;$$0247 = $$1248;$$0269 = $$3272;
 }
 L116: do {
  if ((label|0) == 88) {
   $349 = ($0|0)==(0|0);
   if ($349) {
    $350 = ($$0269|0)==(0);
    if ($350) {
     $$0 = 0;
    } else {
     $$2242302 = 1;
     while(1) {
      $351 = (($4) + ($$2242302<<2)|0);
      $352 = HEAP32[$351>>2]|0;
      $353 = ($352|0)==(0);
      if ($353) {
       $$2242$lcssa = $$2242302;
       break;
      }
      $355 = (($3) + ($$2242302<<3)|0);
      _pop_arg_231($355,$352,$2);
      $356 = (($$2242302) + 1)|0;
      $357 = ($$2242302|0)<(9);
      if ($357) {
       $$2242302 = $356;
      } else {
       $$2242$lcssa = $356;
       break;
      }
     }
     $354 = ($$2242$lcssa|0)<(10);
     if ($354) {
      $$3300 = $$2242$lcssa;
      while(1) {
       $360 = (($4) + ($$3300<<2)|0);
       $361 = HEAP32[$360>>2]|0;
       $362 = ($361|0)==(0);
       if (!($362)) {
        $$0 = -1;
        break L116;
       }
       $358 = (($$3300) + 1)|0;
       $359 = ($$3300|0)<(9);
       if ($359) {
        $$3300 = $358;
       } else {
        $$0 = 1;
        break;
       }
      }
     } else {
      $$0 = 1;
     }
    }
   } else {
    $$0 = $$1248;
   }
  }
 } while(0);
 STACKTOP = sp;return ($$0|0);
}
function ___lockfile($0) {
 $0 = $0|0;
 var label = 0, sp = 0;
 sp = STACKTOP;
 return 0;
}
function ___unlockfile($0) {
 $0 = $0|0;
 var label = 0, sp = 0;
 sp = STACKTOP;
 return;
}
function _out_228($0,$1,$2) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 var $3 = 0, $4 = 0, $5 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $3 = HEAP32[$0>>2]|0;
 $4 = $3 & 32;
 $5 = ($4|0)==(0);
 if ($5) {
  (___fwritex($1,$2,$0)|0);
 }
 return;
}
function _isdigit($0) {
 $0 = $0|0;
 var $1 = 0, $2 = 0, $3 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $1 = (($0) + -48)|0;
 $2 = ($1>>>0)<(10);
 $3 = $2&1;
 return ($3|0);
}
function _getint_229($0) {
 $0 = $0|0;
 var $$0$lcssa = 0, $$04 = 0, $1 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $1 = HEAP32[$0>>2]|0;
 $2 = HEAP8[$1>>0]|0;
 $3 = $2 << 24 >> 24;
 $4 = (_isdigit($3)|0);
 $5 = ($4|0)==(0);
 if ($5) {
  $$0$lcssa = 0;
 } else {
  $$04 = 0;
  while(1) {
   $6 = ($$04*10)|0;
   $7 = HEAP32[$0>>2]|0;
   $8 = HEAP8[$7>>0]|0;
   $9 = $8 << 24 >> 24;
   $10 = (($6) + -48)|0;
   $11 = (($10) + ($9))|0;
   $12 = ((($7)) + 1|0);
   HEAP32[$0>>2] = $12;
   $13 = HEAP8[$12>>0]|0;
   $14 = $13 << 24 >> 24;
   $15 = (_isdigit($14)|0);
   $16 = ($15|0)==(0);
   if ($16) {
    $$0$lcssa = $11;
    break;
   } else {
    $$04 = $11;
   }
  }
 }
 return ($$0$lcssa|0);
}
function _pop_arg_231($0,$1,$2) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 var $$mask = 0, $$mask31 = 0, $10 = 0, $100 = 0, $101 = 0, $102 = 0, $103 = 0, $104 = 0, $105 = 0, $106 = 0, $107 = 0, $108 = 0, $109 = 0.0, $11 = 0, $110 = 0, $111 = 0, $112 = 0, $113 = 0, $114 = 0, $115 = 0;
 var $116 = 0.0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0, $29 = 0, $3 = 0;
 var $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $4 = 0, $40 = 0, $41 = 0, $42 = 0, $43 = 0, $44 = 0, $45 = 0, $46 = 0, $47 = 0, $48 = 0;
 var $49 = 0, $5 = 0, $50 = 0, $51 = 0, $52 = 0, $53 = 0, $54 = 0, $55 = 0, $56 = 0, $57 = 0, $58 = 0, $59 = 0, $6 = 0, $60 = 0, $61 = 0, $62 = 0, $63 = 0, $64 = 0, $65 = 0, $66 = 0;
 var $67 = 0, $68 = 0, $69 = 0, $7 = 0, $70 = 0, $71 = 0, $72 = 0, $73 = 0, $74 = 0, $75 = 0, $76 = 0, $77 = 0, $78 = 0, $79 = 0, $8 = 0, $80 = 0, $81 = 0, $82 = 0, $83 = 0, $84 = 0;
 var $85 = 0, $86 = 0, $87 = 0, $88 = 0, $89 = 0, $9 = 0, $90 = 0, $91 = 0, $92 = 0, $93 = 0, $94 = 0, $95 = 0, $96 = 0, $97 = 0, $98 = 0, $99 = 0, $arglist_current = 0, $arglist_current11 = 0, $arglist_current14 = 0, $arglist_current17 = 0;
 var $arglist_current2 = 0, $arglist_current20 = 0, $arglist_current23 = 0, $arglist_current26 = 0, $arglist_current5 = 0, $arglist_current8 = 0, $arglist_next = 0, $arglist_next12 = 0, $arglist_next15 = 0, $arglist_next18 = 0, $arglist_next21 = 0, $arglist_next24 = 0, $arglist_next27 = 0, $arglist_next3 = 0, $arglist_next6 = 0, $arglist_next9 = 0, $expanded = 0, $expanded28 = 0, $expanded30 = 0, $expanded31 = 0;
 var $expanded32 = 0, $expanded34 = 0, $expanded35 = 0, $expanded37 = 0, $expanded38 = 0, $expanded39 = 0, $expanded41 = 0, $expanded42 = 0, $expanded44 = 0, $expanded45 = 0, $expanded46 = 0, $expanded48 = 0, $expanded49 = 0, $expanded51 = 0, $expanded52 = 0, $expanded53 = 0, $expanded55 = 0, $expanded56 = 0, $expanded58 = 0, $expanded59 = 0;
 var $expanded60 = 0, $expanded62 = 0, $expanded63 = 0, $expanded65 = 0, $expanded66 = 0, $expanded67 = 0, $expanded69 = 0, $expanded70 = 0, $expanded72 = 0, $expanded73 = 0, $expanded74 = 0, $expanded76 = 0, $expanded77 = 0, $expanded79 = 0, $expanded80 = 0, $expanded81 = 0, $expanded83 = 0, $expanded84 = 0, $expanded86 = 0, $expanded87 = 0;
 var $expanded88 = 0, $expanded90 = 0, $expanded91 = 0, $expanded93 = 0, $expanded94 = 0, $expanded95 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $3 = ($1>>>0)>(20);
 L1: do {
  if (!($3)) {
   do {
    switch ($1|0) {
    case 9:  {
     $arglist_current = HEAP32[$2>>2]|0;
     $4 = $arglist_current;
     $5 = ((0) + 4|0);
     $expanded28 = $5;
     $expanded = (($expanded28) - 1)|0;
     $6 = (($4) + ($expanded))|0;
     $7 = ((0) + 4|0);
     $expanded32 = $7;
     $expanded31 = (($expanded32) - 1)|0;
     $expanded30 = $expanded31 ^ -1;
     $8 = $6 & $expanded30;
     $9 = $8;
     $10 = HEAP32[$9>>2]|0;
     $arglist_next = ((($9)) + 4|0);
     HEAP32[$2>>2] = $arglist_next;
     HEAP32[$0>>2] = $10;
     break L1;
     break;
    }
    case 10:  {
     $arglist_current2 = HEAP32[$2>>2]|0;
     $11 = $arglist_current2;
     $12 = ((0) + 4|0);
     $expanded35 = $12;
     $expanded34 = (($expanded35) - 1)|0;
     $13 = (($11) + ($expanded34))|0;
     $14 = ((0) + 4|0);
     $expanded39 = $14;
     $expanded38 = (($expanded39) - 1)|0;
     $expanded37 = $expanded38 ^ -1;
     $15 = $13 & $expanded37;
     $16 = $15;
     $17 = HEAP32[$16>>2]|0;
     $arglist_next3 = ((($16)) + 4|0);
     HEAP32[$2>>2] = $arglist_next3;
     $18 = ($17|0)<(0);
     $19 = $18 << 31 >> 31;
     $20 = $0;
     $21 = $20;
     HEAP32[$21>>2] = $17;
     $22 = (($20) + 4)|0;
     $23 = $22;
     HEAP32[$23>>2] = $19;
     break L1;
     break;
    }
    case 11:  {
     $arglist_current5 = HEAP32[$2>>2]|0;
     $24 = $arglist_current5;
     $25 = ((0) + 4|0);
     $expanded42 = $25;
     $expanded41 = (($expanded42) - 1)|0;
     $26 = (($24) + ($expanded41))|0;
     $27 = ((0) + 4|0);
     $expanded46 = $27;
     $expanded45 = (($expanded46) - 1)|0;
     $expanded44 = $expanded45 ^ -1;
     $28 = $26 & $expanded44;
     $29 = $28;
     $30 = HEAP32[$29>>2]|0;
     $arglist_next6 = ((($29)) + 4|0);
     HEAP32[$2>>2] = $arglist_next6;
     $31 = $0;
     $32 = $31;
     HEAP32[$32>>2] = $30;
     $33 = (($31) + 4)|0;
     $34 = $33;
     HEAP32[$34>>2] = 0;
     break L1;
     break;
    }
    case 12:  {
     $arglist_current8 = HEAP32[$2>>2]|0;
     $35 = $arglist_current8;
     $36 = ((0) + 8|0);
     $expanded49 = $36;
     $expanded48 = (($expanded49) - 1)|0;
     $37 = (($35) + ($expanded48))|0;
     $38 = ((0) + 8|0);
     $expanded53 = $38;
     $expanded52 = (($expanded53) - 1)|0;
     $expanded51 = $expanded52 ^ -1;
     $39 = $37 & $expanded51;
     $40 = $39;
     $41 = $40;
     $42 = $41;
     $43 = HEAP32[$42>>2]|0;
     $44 = (($41) + 4)|0;
     $45 = $44;
     $46 = HEAP32[$45>>2]|0;
     $arglist_next9 = ((($40)) + 8|0);
     HEAP32[$2>>2] = $arglist_next9;
     $47 = $0;
     $48 = $47;
     HEAP32[$48>>2] = $43;
     $49 = (($47) + 4)|0;
     $50 = $49;
     HEAP32[$50>>2] = $46;
     break L1;
     break;
    }
    case 13:  {
     $arglist_current11 = HEAP32[$2>>2]|0;
     $51 = $arglist_current11;
     $52 = ((0) + 4|0);
     $expanded56 = $52;
     $expanded55 = (($expanded56) - 1)|0;
     $53 = (($51) + ($expanded55))|0;
     $54 = ((0) + 4|0);
     $expanded60 = $54;
     $expanded59 = (($expanded60) - 1)|0;
     $expanded58 = $expanded59 ^ -1;
     $55 = $53 & $expanded58;
     $56 = $55;
     $57 = HEAP32[$56>>2]|0;
     $arglist_next12 = ((($56)) + 4|0);
     HEAP32[$2>>2] = $arglist_next12;
     $58 = $57&65535;
     $59 = $58 << 16 >> 16;
     $60 = ($59|0)<(0);
     $61 = $60 << 31 >> 31;
     $62 = $0;
     $63 = $62;
     HEAP32[$63>>2] = $59;
     $64 = (($62) + 4)|0;
     $65 = $64;
     HEAP32[$65>>2] = $61;
     break L1;
     break;
    }
    case 14:  {
     $arglist_current14 = HEAP32[$2>>2]|0;
     $66 = $arglist_current14;
     $67 = ((0) + 4|0);
     $expanded63 = $67;
     $expanded62 = (($expanded63) - 1)|0;
     $68 = (($66) + ($expanded62))|0;
     $69 = ((0) + 4|0);
     $expanded67 = $69;
     $expanded66 = (($expanded67) - 1)|0;
     $expanded65 = $expanded66 ^ -1;
     $70 = $68 & $expanded65;
     $71 = $70;
     $72 = HEAP32[$71>>2]|0;
     $arglist_next15 = ((($71)) + 4|0);
     HEAP32[$2>>2] = $arglist_next15;
     $$mask31 = $72 & 65535;
     $73 = $0;
     $74 = $73;
     HEAP32[$74>>2] = $$mask31;
     $75 = (($73) + 4)|0;
     $76 = $75;
     HEAP32[$76>>2] = 0;
     break L1;
     break;
    }
    case 15:  {
     $arglist_current17 = HEAP32[$2>>2]|0;
     $77 = $arglist_current17;
     $78 = ((0) + 4|0);
     $expanded70 = $78;
     $expanded69 = (($expanded70) - 1)|0;
     $79 = (($77) + ($expanded69))|0;
     $80 = ((0) + 4|0);
     $expanded74 = $80;
     $expanded73 = (($expanded74) - 1)|0;
     $expanded72 = $expanded73 ^ -1;
     $81 = $79 & $expanded72;
     $82 = $81;
     $83 = HEAP32[$82>>2]|0;
     $arglist_next18 = ((($82)) + 4|0);
     HEAP32[$2>>2] = $arglist_next18;
     $84 = $83&255;
     $85 = $84 << 24 >> 24;
     $86 = ($85|0)<(0);
     $87 = $86 << 31 >> 31;
     $88 = $0;
     $89 = $88;
     HEAP32[$89>>2] = $85;
     $90 = (($88) + 4)|0;
     $91 = $90;
     HEAP32[$91>>2] = $87;
     break L1;
     break;
    }
    case 16:  {
     $arglist_current20 = HEAP32[$2>>2]|0;
     $92 = $arglist_current20;
     $93 = ((0) + 4|0);
     $expanded77 = $93;
     $expanded76 = (($expanded77) - 1)|0;
     $94 = (($92) + ($expanded76))|0;
     $95 = ((0) + 4|0);
     $expanded81 = $95;
     $expanded80 = (($expanded81) - 1)|0;
     $expanded79 = $expanded80 ^ -1;
     $96 = $94 & $expanded79;
     $97 = $96;
     $98 = HEAP32[$97>>2]|0;
     $arglist_next21 = ((($97)) + 4|0);
     HEAP32[$2>>2] = $arglist_next21;
     $$mask = $98 & 255;
     $99 = $0;
     $100 = $99;
     HEAP32[$100>>2] = $$mask;
     $101 = (($99) + 4)|0;
     $102 = $101;
     HEAP32[$102>>2] = 0;
     break L1;
     break;
    }
    case 17:  {
     $arglist_current23 = HEAP32[$2>>2]|0;
     $103 = $arglist_current23;
     $104 = ((0) + 8|0);
     $expanded84 = $104;
     $expanded83 = (($expanded84) - 1)|0;
     $105 = (($103) + ($expanded83))|0;
     $106 = ((0) + 8|0);
     $expanded88 = $106;
     $expanded87 = (($expanded88) - 1)|0;
     $expanded86 = $expanded87 ^ -1;
     $107 = $105 & $expanded86;
     $108 = $107;
     $109 = +HEAPF64[$108>>3];
     $arglist_next24 = ((($108)) + 8|0);
     HEAP32[$2>>2] = $arglist_next24;
     HEAPF64[$0>>3] = $109;
     break L1;
     break;
    }
    case 18:  {
     $arglist_current26 = HEAP32[$2>>2]|0;
     $110 = $arglist_current26;
     $111 = ((0) + 8|0);
     $expanded91 = $111;
     $expanded90 = (($expanded91) - 1)|0;
     $112 = (($110) + ($expanded90))|0;
     $113 = ((0) + 8|0);
     $expanded95 = $113;
     $expanded94 = (($expanded95) - 1)|0;
     $expanded93 = $expanded94 ^ -1;
     $114 = $112 & $expanded93;
     $115 = $114;
     $116 = +HEAPF64[$115>>3];
     $arglist_next27 = ((($115)) + 8|0);
     HEAP32[$2>>2] = $arglist_next27;
     HEAPF64[$0>>3] = $116;
     break L1;
     break;
    }
    default: {
     break L1;
    }
    }
   } while(0);
  }
 } while(0);
 return;
}
function _fmt_x($0,$1,$2,$3) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 $3 = $3|0;
 var $$05$lcssa = 0, $$056 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $20 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0;
 var sp = 0;
 sp = STACKTOP;
 $4 = ($0|0)==(0);
 $5 = ($1|0)==(0);
 $6 = $4 & $5;
 if ($6) {
  $$05$lcssa = $2;
 } else {
  $$056 = $2;$15 = $1;$8 = $0;
  while(1) {
   $7 = $8 & 15;
   $9 = (8655 + ($7)|0);
   $10 = HEAP8[$9>>0]|0;
   $11 = $10&255;
   $12 = $11 | $3;
   $13 = $12&255;
   $14 = ((($$056)) + -1|0);
   HEAP8[$14>>0] = $13;
   $16 = (_bitshift64Lshr(($8|0),($15|0),4)|0);
   $17 = tempRet0;
   $18 = ($16|0)==(0);
   $19 = ($17|0)==(0);
   $20 = $18 & $19;
   if ($20) {
    $$05$lcssa = $14;
    break;
   } else {
    $$056 = $14;$15 = $17;$8 = $16;
   }
  }
 }
 return ($$05$lcssa|0);
}
function _fmt_o($0,$1,$2) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 var $$0$lcssa = 0, $$06 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $3 = ($0|0)==(0);
 $4 = ($1|0)==(0);
 $5 = $3 & $4;
 if ($5) {
  $$0$lcssa = $2;
 } else {
  $$06 = $2;$11 = $1;$7 = $0;
  while(1) {
   $6 = $7&255;
   $8 = $6 & 7;
   $9 = $8 | 48;
   $10 = ((($$06)) + -1|0);
   HEAP8[$10>>0] = $9;
   $12 = (_bitshift64Lshr(($7|0),($11|0),3)|0);
   $13 = tempRet0;
   $14 = ($12|0)==(0);
   $15 = ($13|0)==(0);
   $16 = $14 & $15;
   if ($16) {
    $$0$lcssa = $10;
    break;
   } else {
    $$06 = $10;$11 = $13;$7 = $12;
   }
  }
 }
 return ($$0$lcssa|0);
}
function _fmt_u($0,$1,$2) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 var $$010$lcssa$off0 = 0, $$012 = 0, $$09$lcssa = 0, $$0914 = 0, $$1$lcssa = 0, $$111 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0;
 var $24 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $3 = ($1>>>0)>(0);
 $4 = ($0>>>0)>(4294967295);
 $5 = ($1|0)==(0);
 $6 = $5 & $4;
 $7 = $3 | $6;
 if ($7) {
  $$0914 = $2;$8 = $0;$9 = $1;
  while(1) {
   $10 = (___uremdi3(($8|0),($9|0),10,0)|0);
   $11 = tempRet0;
   $12 = $10&255;
   $13 = $12 | 48;
   $14 = ((($$0914)) + -1|0);
   HEAP8[$14>>0] = $13;
   $15 = (___udivdi3(($8|0),($9|0),10,0)|0);
   $16 = tempRet0;
   $17 = ($9>>>0)>(9);
   $18 = ($8>>>0)>(4294967295);
   $19 = ($9|0)==(9);
   $20 = $19 & $18;
   $21 = $17 | $20;
   if ($21) {
    $$0914 = $14;$8 = $15;$9 = $16;
   } else {
    break;
   }
  }
  $$010$lcssa$off0 = $15;$$09$lcssa = $14;
 } else {
  $$010$lcssa$off0 = $0;$$09$lcssa = $2;
 }
 $22 = ($$010$lcssa$off0|0)==(0);
 if ($22) {
  $$1$lcssa = $$09$lcssa;
 } else {
  $$012 = $$010$lcssa$off0;$$111 = $$09$lcssa;
  while(1) {
   $23 = (($$012>>>0) % 10)&-1;
   $24 = $23 | 48;
   $25 = $24&255;
   $26 = ((($$111)) + -1|0);
   HEAP8[$26>>0] = $25;
   $27 = (($$012>>>0) / 10)&-1;
   $28 = ($$012>>>0)<(10);
   if ($28) {
    $$1$lcssa = $26;
    break;
   } else {
    $$012 = $27;$$111 = $26;
   }
  }
 }
 return ($$1$lcssa|0);
}
function _strerror($0) {
 $0 = $0|0;
 var $1 = 0, $2 = 0, $3 = 0, $4 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $1 = (___pthread_self_376()|0);
 $2 = ((($1)) + 188|0);
 $3 = HEAP32[$2>>2]|0;
 $4 = (___strerror_l($0,$3)|0);
 return ($4|0);
}
function _pad_234($0,$1,$2,$3,$4) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 $3 = $3|0;
 $4 = $4|0;
 var $$0$lcssa = 0, $$011 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, $or$cond = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 256|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(256|0);
 $5 = sp;
 $6 = $4 & 73728;
 $7 = ($6|0)==(0);
 $8 = ($2|0)>($3|0);
 $or$cond = $8 & $7;
 if ($or$cond) {
  $9 = (($2) - ($3))|0;
  $10 = $1 << 24 >> 24;
  $11 = ($9>>>0)<(256);
  $12 = $11 ? $9 : 256;
  (_memset(($5|0),($10|0),($12|0))|0);
  $13 = ($9>>>0)>(255);
  if ($13) {
   $14 = (($2) - ($3))|0;
   $$011 = $9;
   while(1) {
    _out_228($0,$5,256);
    $15 = (($$011) + -256)|0;
    $16 = ($15>>>0)>(255);
    if ($16) {
     $$011 = $15;
    } else {
     break;
    }
   }
   $17 = $14 & 255;
   $$0$lcssa = $17;
  } else {
   $$0$lcssa = $9;
  }
  _out_228($0,$5,$$0$lcssa);
 }
 STACKTOP = sp;return;
}
function _wctomb($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $$0 = 0, $2 = 0, $3 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $2 = ($0|0)==(0|0);
 if ($2) {
  $$0 = 0;
 } else {
  $3 = (_wcrtomb($0,$1,0)|0);
  $$0 = $3;
 }
 return ($$0|0);
}
function _fmt_fp($0,$1,$2,$3,$4,$5) {
 $0 = $0|0;
 $1 = +$1;
 $2 = $2|0;
 $3 = $3|0;
 $4 = $4|0;
 $5 = $5|0;
 var $$ = 0, $$$ = 0, $$$$564 = 0.0, $$$3484 = 0, $$$3484699 = 0, $$$3484700 = 0, $$$3501 = 0, $$$4502 = 0, $$$543 = 0.0, $$$564 = 0.0, $$0 = 0, $$0463$lcssa = 0, $$0463587 = 0, $$0464597 = 0, $$0471 = 0.0, $$0479 = 0, $$0487644 = 0, $$0488 = 0, $$0488655 = 0, $$0488657 = 0;
 var $$0496$$9 = 0, $$0497656 = 0, $$0498 = 0, $$0509585 = 0.0, $$0510 = 0, $$0511 = 0, $$0514639 = 0, $$0520 = 0, $$0521 = 0, $$0521$ = 0, $$0523 = 0, $$0527 = 0, $$0527$in633 = 0, $$0530638 = 0, $$1465 = 0, $$1467 = 0.0, $$1469 = 0.0, $$1472 = 0.0, $$1480 = 0, $$1482$lcssa = 0;
 var $$1482663 = 0, $$1489643 = 0, $$1499$lcssa = 0, $$1499662 = 0, $$1508586 = 0, $$1512$lcssa = 0, $$1512610 = 0, $$1515 = 0, $$1524 = 0, $$1526 = 0, $$1528617 = 0, $$1531$lcssa = 0, $$1531632 = 0, $$1601 = 0, $$2 = 0, $$2473 = 0.0, $$2476 = 0, $$2476$$549 = 0, $$2476$$551 = 0, $$2483$ph = 0;
 var $$2500 = 0, $$2513 = 0, $$2516621 = 0, $$2529 = 0, $$2532620 = 0, $$3 = 0.0, $$3477 = 0, $$3484$lcssa = 0, $$3484650 = 0, $$3501$lcssa = 0, $$3501649 = 0, $$3533616 = 0, $$4 = 0.0, $$4478$lcssa = 0, $$4478593 = 0, $$4492 = 0, $$4502 = 0, $$4518 = 0, $$5$lcssa = 0, $$534$ = 0;
 var $$540 = 0, $$540$ = 0, $$543 = 0.0, $$548 = 0, $$5486$lcssa = 0, $$5486626 = 0, $$5493600 = 0, $$550 = 0, $$5519$ph = 0, $$557 = 0, $$5605 = 0, $$561 = 0, $$564 = 0.0, $$6 = 0, $$6494592 = 0, $$7495604 = 0, $$7505 = 0, $$7505$ = 0, $$7505$ph = 0, $$8 = 0;
 var $$9$ph = 0, $$lcssa675 = 0, $$neg = 0, $$neg568 = 0, $$pn = 0, $$pr = 0, $$pr566 = 0, $$pre = 0, $$pre$phi691Z2D = 0, $$pre$phi698Z2D = 0, $$pre690 = 0, $$pre693 = 0, $$pre697 = 0, $$sink = 0, $$sink547$lcssa = 0, $$sink547625 = 0, $$sink560 = 0, $10 = 0, $100 = 0, $101 = 0;
 var $102 = 0, $103 = 0, $104 = 0, $105 = 0, $106 = 0, $107 = 0, $108 = 0, $109 = 0, $11 = 0, $110 = 0, $111 = 0.0, $112 = 0, $113 = 0, $114 = 0, $115 = 0, $116 = 0, $117 = 0, $118 = 0.0, $119 = 0.0, $12 = 0;
 var $120 = 0.0, $121 = 0, $122 = 0, $123 = 0, $124 = 0, $125 = 0, $126 = 0, $127 = 0, $128 = 0, $129 = 0, $13 = 0, $130 = 0, $131 = 0, $132 = 0, $133 = 0, $134 = 0, $135 = 0, $136 = 0, $137 = 0, $138 = 0;
 var $139 = 0, $14 = 0.0, $140 = 0, $141 = 0, $142 = 0, $143 = 0, $144 = 0, $145 = 0, $146 = 0, $147 = 0, $148 = 0, $149 = 0, $15 = 0, $150 = 0, $151 = 0, $152 = 0, $153 = 0, $154 = 0, $155 = 0, $156 = 0;
 var $157 = 0, $158 = 0, $159 = 0, $16 = 0, $160 = 0, $161 = 0, $162 = 0, $163 = 0, $164 = 0, $165 = 0, $166 = 0, $167 = 0, $168 = 0, $169 = 0, $17 = 0, $170 = 0, $171 = 0, $172 = 0, $173 = 0, $174 = 0;
 var $175 = 0, $176 = 0, $177 = 0, $178 = 0, $179 = 0, $18 = 0, $180 = 0, $181 = 0, $182 = 0, $183 = 0, $184 = 0, $185 = 0, $186 = 0, $187 = 0, $188 = 0, $189 = 0, $19 = 0, $190 = 0, $191 = 0, $192 = 0;
 var $193 = 0, $194 = 0, $195 = 0, $196 = 0, $197 = 0, $198 = 0, $199 = 0, $20 = 0, $200 = 0, $201 = 0, $202 = 0, $203 = 0, $204 = 0, $205 = 0, $206 = 0, $207 = 0, $208 = 0, $209 = 0, $21 = 0, $210 = 0;
 var $211 = 0, $212 = 0, $213 = 0, $214 = 0, $215 = 0, $216 = 0, $217 = 0, $218 = 0, $219 = 0, $22 = 0, $220 = 0, $221 = 0, $222 = 0, $223 = 0, $224 = 0, $225 = 0, $226 = 0, $227 = 0, $228 = 0, $229 = 0;
 var $23 = 0, $230 = 0, $231 = 0.0, $232 = 0.0, $233 = 0, $234 = 0.0, $235 = 0, $236 = 0, $237 = 0, $238 = 0, $239 = 0, $24 = 0, $240 = 0, $241 = 0, $242 = 0, $243 = 0, $244 = 0, $245 = 0, $246 = 0, $247 = 0;
 var $248 = 0, $249 = 0, $25 = 0, $250 = 0, $251 = 0, $252 = 0, $253 = 0, $254 = 0, $255 = 0, $256 = 0, $257 = 0, $258 = 0, $259 = 0, $26 = 0, $260 = 0, $261 = 0, $262 = 0, $263 = 0, $264 = 0, $265 = 0;
 var $266 = 0, $267 = 0, $268 = 0, $269 = 0, $27 = 0, $270 = 0, $271 = 0, $272 = 0, $273 = 0, $274 = 0, $275 = 0, $276 = 0, $277 = 0, $278 = 0, $279 = 0, $28 = 0, $280 = 0, $281 = 0, $282 = 0, $283 = 0;
 var $284 = 0, $285 = 0, $286 = 0, $287 = 0, $288 = 0, $289 = 0, $29 = 0, $290 = 0, $291 = 0, $292 = 0, $293 = 0, $294 = 0, $295 = 0, $296 = 0, $297 = 0, $298 = 0, $299 = 0, $30 = 0, $300 = 0, $301 = 0;
 var $302 = 0, $303 = 0, $304 = 0, $305 = 0, $306 = 0, $307 = 0, $308 = 0, $309 = 0, $31 = 0, $310 = 0, $311 = 0, $312 = 0, $313 = 0, $314 = 0, $315 = 0, $316 = 0, $317 = 0, $318 = 0, $319 = 0, $32 = 0;
 var $320 = 0, $321 = 0, $322 = 0, $323 = 0, $324 = 0, $325 = 0, $326 = 0, $327 = 0, $328 = 0, $329 = 0, $33 = 0, $330 = 0, $331 = 0, $332 = 0, $333 = 0, $334 = 0, $335 = 0, $336 = 0, $337 = 0, $338 = 0;
 var $339 = 0, $34 = 0.0, $340 = 0, $341 = 0, $342 = 0, $343 = 0, $344 = 0, $345 = 0, $346 = 0, $347 = 0, $348 = 0, $349 = 0, $35 = 0.0, $350 = 0, $351 = 0, $352 = 0, $353 = 0, $354 = 0, $355 = 0, $356 = 0;
 var $357 = 0, $358 = 0, $359 = 0, $36 = 0, $360 = 0, $361 = 0, $362 = 0, $363 = 0, $364 = 0, $365 = 0, $366 = 0, $367 = 0, $368 = 0, $369 = 0, $37 = 0, $370 = 0, $371 = 0, $372 = 0, $373 = 0, $374 = 0;
 var $375 = 0, $376 = 0, $377 = 0, $378 = 0, $379 = 0, $38 = 0, $380 = 0, $381 = 0, $382 = 0, $383 = 0, $384 = 0, $385 = 0, $386 = 0, $387 = 0, $388 = 0, $389 = 0, $39 = 0, $390 = 0, $391 = 0, $40 = 0;
 var $41 = 0, $42 = 0, $43 = 0, $44 = 0, $45 = 0, $46 = 0, $47 = 0, $48 = 0, $49 = 0, $50 = 0.0, $51 = 0, $52 = 0, $53 = 0, $54 = 0.0, $55 = 0.0, $56 = 0.0, $57 = 0.0, $58 = 0.0, $59 = 0.0, $6 = 0;
 var $60 = 0, $61 = 0, $62 = 0, $63 = 0, $64 = 0, $65 = 0, $66 = 0, $67 = 0, $68 = 0, $69 = 0, $7 = 0, $70 = 0, $71 = 0, $72 = 0, $73 = 0, $74 = 0, $75 = 0, $76 = 0, $77 = 0, $78 = 0;
 var $79 = 0, $8 = 0, $80 = 0, $81 = 0, $82 = 0, $83 = 0, $84 = 0, $85 = 0, $86 = 0, $87 = 0.0, $88 = 0.0, $89 = 0.0, $9 = 0, $90 = 0, $91 = 0, $92 = 0, $93 = 0, $94 = 0, $95 = 0, $96 = 0;
 var $97 = 0, $98 = 0, $99 = 0, $not$ = 0, $or$cond = 0, $or$cond3$not = 0, $or$cond542 = 0, $or$cond545 = 0, $or$cond556 = 0, $or$cond6 = 0, $scevgep686 = 0, $scevgep686687 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 560|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(560|0);
 $6 = sp + 8|0;
 $7 = sp;
 $8 = sp + 524|0;
 $9 = $8;
 $10 = sp + 512|0;
 HEAP32[$7>>2] = 0;
 $11 = ((($10)) + 12|0);
 (___DOUBLE_BITS_235($1)|0);
 $12 = tempRet0;
 $13 = ($12|0)<(0);
 if ($13) {
  $14 = - $1;
  $$0471 = $14;$$0520 = 1;$$0521 = 8620;
 } else {
  $15 = $4 & 2048;
  $16 = ($15|0)==(0);
  $17 = $4 & 1;
  $18 = ($17|0)==(0);
  $$ = $18 ? (8621) : (8626);
  $$$ = $16 ? $$ : (8623);
  $19 = $4 & 2049;
  $20 = ($19|0)!=(0);
  $$534$ = $20&1;
  $$0471 = $1;$$0520 = $$534$;$$0521 = $$$;
 }
 (___DOUBLE_BITS_235($$0471)|0);
 $21 = tempRet0;
 $22 = $21 & 2146435072;
 $23 = (0)==(0);
 $24 = ($22|0)==(2146435072);
 $25 = $23 & $24;
 do {
  if ($25) {
   $26 = $5 & 32;
   $27 = ($26|0)!=(0);
   $28 = $27 ? 8639 : 8643;
   $29 = ($$0471 != $$0471) | (0.0 != 0.0);
   $30 = $27 ? 8647 : 8651;
   $$0510 = $29 ? $30 : $28;
   $31 = (($$0520) + 3)|0;
   $32 = $4 & -65537;
   _pad_234($0,32,$2,$31,$32);
   _out_228($0,$$0521,$$0520);
   _out_228($0,$$0510,3);
   $33 = $4 ^ 8192;
   _pad_234($0,32,$2,$31,$33);
   $$sink560 = $31;
  } else {
   $34 = (+_frexpl($$0471,$7));
   $35 = $34 * 2.0;
   $36 = $35 != 0.0;
   if ($36) {
    $37 = HEAP32[$7>>2]|0;
    $38 = (($37) + -1)|0;
    HEAP32[$7>>2] = $38;
   }
   $39 = $5 | 32;
   $40 = ($39|0)==(97);
   if ($40) {
    $41 = $5 & 32;
    $42 = ($41|0)==(0);
    $43 = ((($$0521)) + 9|0);
    $$0521$ = $42 ? $$0521 : $43;
    $44 = $$0520 | 2;
    $45 = ($3>>>0)>(11);
    $46 = (12 - ($3))|0;
    $47 = ($46|0)==(0);
    $48 = $45 | $47;
    do {
     if ($48) {
      $$1472 = $35;
     } else {
      $$0509585 = 8.0;$$1508586 = $46;
      while(1) {
       $49 = (($$1508586) + -1)|0;
       $50 = $$0509585 * 16.0;
       $51 = ($49|0)==(0);
       if ($51) {
        break;
       } else {
        $$0509585 = $50;$$1508586 = $49;
       }
      }
      $52 = HEAP8[$$0521$>>0]|0;
      $53 = ($52<<24>>24)==(45);
      if ($53) {
       $54 = - $35;
       $55 = $54 - $50;
       $56 = $50 + $55;
       $57 = - $56;
       $$1472 = $57;
       break;
      } else {
       $58 = $35 + $50;
       $59 = $58 - $50;
       $$1472 = $59;
       break;
      }
     }
    } while(0);
    $60 = HEAP32[$7>>2]|0;
    $61 = ($60|0)<(0);
    $62 = (0 - ($60))|0;
    $63 = $61 ? $62 : $60;
    $64 = ($63|0)<(0);
    $65 = $64 << 31 >> 31;
    $66 = (_fmt_u($63,$65,$11)|0);
    $67 = ($66|0)==($11|0);
    if ($67) {
     $68 = ((($10)) + 11|0);
     HEAP8[$68>>0] = 48;
     $$0511 = $68;
    } else {
     $$0511 = $66;
    }
    $69 = $60 >> 31;
    $70 = $69 & 2;
    $71 = (($70) + 43)|0;
    $72 = $71&255;
    $73 = ((($$0511)) + -1|0);
    HEAP8[$73>>0] = $72;
    $74 = (($5) + 15)|0;
    $75 = $74&255;
    $76 = ((($$0511)) + -2|0);
    HEAP8[$76>>0] = $75;
    $77 = ($3|0)<(1);
    $78 = $4 & 8;
    $79 = ($78|0)==(0);
    $$0523 = $8;$$2473 = $$1472;
    while(1) {
     $80 = (~~(($$2473)));
     $81 = (8655 + ($80)|0);
     $82 = HEAP8[$81>>0]|0;
     $83 = $82&255;
     $84 = $41 | $83;
     $85 = $84&255;
     $86 = ((($$0523)) + 1|0);
     HEAP8[$$0523>>0] = $85;
     $87 = (+($80|0));
     $88 = $$2473 - $87;
     $89 = $88 * 16.0;
     $90 = $86;
     $91 = (($90) - ($9))|0;
     $92 = ($91|0)==(1);
     if ($92) {
      $93 = $89 == 0.0;
      $or$cond3$not = $77 & $93;
      $or$cond = $79 & $or$cond3$not;
      if ($or$cond) {
       $$1524 = $86;
      } else {
       $94 = ((($$0523)) + 2|0);
       HEAP8[$86>>0] = 46;
       $$1524 = $94;
      }
     } else {
      $$1524 = $86;
     }
     $95 = $89 != 0.0;
     if ($95) {
      $$0523 = $$1524;$$2473 = $89;
     } else {
      break;
     }
    }
    $96 = ($3|0)==(0);
    $$pre693 = $$1524;
    if ($96) {
     label = 24;
    } else {
     $97 = (-2 - ($9))|0;
     $98 = (($97) + ($$pre693))|0;
     $99 = ($98|0)<($3|0);
     if ($99) {
      $100 = (($3) + 2)|0;
      $$pre690 = (($$pre693) - ($9))|0;
      $$pre$phi691Z2D = $$pre690;$$sink = $100;
     } else {
      label = 24;
     }
    }
    if ((label|0) == 24) {
     $101 = (($$pre693) - ($9))|0;
     $$pre$phi691Z2D = $101;$$sink = $101;
    }
    $102 = $11;
    $103 = $76;
    $104 = (($102) - ($103))|0;
    $105 = (($104) + ($44))|0;
    $106 = (($105) + ($$sink))|0;
    _pad_234($0,32,$2,$106,$4);
    _out_228($0,$$0521$,$44);
    $107 = $4 ^ 65536;
    _pad_234($0,48,$2,$106,$107);
    _out_228($0,$8,$$pre$phi691Z2D);
    $108 = (($$sink) - ($$pre$phi691Z2D))|0;
    _pad_234($0,48,$108,0,0);
    _out_228($0,$76,$104);
    $109 = $4 ^ 8192;
    _pad_234($0,32,$2,$106,$109);
    $$sink560 = $106;
    break;
   }
   $110 = ($3|0)<(0);
   $$540 = $110 ? 6 : $3;
   if ($36) {
    $111 = $35 * 268435456.0;
    $112 = HEAP32[$7>>2]|0;
    $113 = (($112) + -28)|0;
    HEAP32[$7>>2] = $113;
    $$3 = $111;$$pr = $113;
   } else {
    $$pre = HEAP32[$7>>2]|0;
    $$3 = $35;$$pr = $$pre;
   }
   $114 = ($$pr|0)<(0);
   $115 = ((($6)) + 288|0);
   $$561 = $114 ? $6 : $115;
   $$0498 = $$561;$$4 = $$3;
   while(1) {
    $116 = (~~(($$4))>>>0);
    HEAP32[$$0498>>2] = $116;
    $117 = ((($$0498)) + 4|0);
    $118 = (+($116>>>0));
    $119 = $$4 - $118;
    $120 = $119 * 1.0E+9;
    $121 = $120 != 0.0;
    if ($121) {
     $$0498 = $117;$$4 = $120;
    } else {
     break;
    }
   }
   $122 = ($$pr|0)>(0);
   if ($122) {
    $$1482663 = $$561;$$1499662 = $117;$123 = $$pr;
    while(1) {
     $124 = ($123|0)<(29);
     $125 = $124 ? $123 : 29;
     $$0488655 = ((($$1499662)) + -4|0);
     $126 = ($$0488655>>>0)<($$1482663>>>0);
     if ($126) {
      $$2483$ph = $$1482663;
     } else {
      $$0488657 = $$0488655;$$0497656 = 0;
      while(1) {
       $127 = HEAP32[$$0488657>>2]|0;
       $128 = (_bitshift64Shl(($127|0),0,($125|0))|0);
       $129 = tempRet0;
       $130 = (_i64Add(($128|0),($129|0),($$0497656|0),0)|0);
       $131 = tempRet0;
       $132 = (___uremdi3(($130|0),($131|0),1000000000,0)|0);
       $133 = tempRet0;
       HEAP32[$$0488657>>2] = $132;
       $134 = (___udivdi3(($130|0),($131|0),1000000000,0)|0);
       $135 = tempRet0;
       $$0488 = ((($$0488657)) + -4|0);
       $136 = ($$0488>>>0)<($$1482663>>>0);
       if ($136) {
        break;
       } else {
        $$0488657 = $$0488;$$0497656 = $134;
       }
      }
      $137 = ($134|0)==(0);
      if ($137) {
       $$2483$ph = $$1482663;
      } else {
       $138 = ((($$1482663)) + -4|0);
       HEAP32[$138>>2] = $134;
       $$2483$ph = $138;
      }
     }
     $$2500 = $$1499662;
     while(1) {
      $139 = ($$2500>>>0)>($$2483$ph>>>0);
      if (!($139)) {
       break;
      }
      $140 = ((($$2500)) + -4|0);
      $141 = HEAP32[$140>>2]|0;
      $142 = ($141|0)==(0);
      if ($142) {
       $$2500 = $140;
      } else {
       break;
      }
     }
     $143 = HEAP32[$7>>2]|0;
     $144 = (($143) - ($125))|0;
     HEAP32[$7>>2] = $144;
     $145 = ($144|0)>(0);
     if ($145) {
      $$1482663 = $$2483$ph;$$1499662 = $$2500;$123 = $144;
     } else {
      $$1482$lcssa = $$2483$ph;$$1499$lcssa = $$2500;$$pr566 = $144;
      break;
     }
    }
   } else {
    $$1482$lcssa = $$561;$$1499$lcssa = $117;$$pr566 = $$pr;
   }
   $146 = ($$pr566|0)<(0);
   if ($146) {
    $147 = (($$540) + 25)|0;
    $148 = (($147|0) / 9)&-1;
    $149 = (($148) + 1)|0;
    $150 = ($39|0)==(102);
    $$3484650 = $$1482$lcssa;$$3501649 = $$1499$lcssa;$152 = $$pr566;
    while(1) {
     $151 = (0 - ($152))|0;
     $153 = ($151|0)<(9);
     $154 = $153 ? $151 : 9;
     $155 = ($$3484650>>>0)<($$3501649>>>0);
     if ($155) {
      $159 = 1 << $154;
      $160 = (($159) + -1)|0;
      $161 = 1000000000 >>> $154;
      $$0487644 = 0;$$1489643 = $$3484650;
      while(1) {
       $162 = HEAP32[$$1489643>>2]|0;
       $163 = $162 & $160;
       $164 = $162 >>> $154;
       $165 = (($164) + ($$0487644))|0;
       HEAP32[$$1489643>>2] = $165;
       $166 = Math_imul($163, $161)|0;
       $167 = ((($$1489643)) + 4|0);
       $168 = ($167>>>0)<($$3501649>>>0);
       if ($168) {
        $$0487644 = $166;$$1489643 = $167;
       } else {
        break;
       }
      }
      $169 = HEAP32[$$3484650>>2]|0;
      $170 = ($169|0)==(0);
      $171 = ((($$3484650)) + 4|0);
      $$$3484 = $170 ? $171 : $$3484650;
      $172 = ($166|0)==(0);
      if ($172) {
       $$$3484700 = $$$3484;$$4502 = $$3501649;
      } else {
       $173 = ((($$3501649)) + 4|0);
       HEAP32[$$3501649>>2] = $166;
       $$$3484700 = $$$3484;$$4502 = $173;
      }
     } else {
      $156 = HEAP32[$$3484650>>2]|0;
      $157 = ($156|0)==(0);
      $158 = ((($$3484650)) + 4|0);
      $$$3484699 = $157 ? $158 : $$3484650;
      $$$3484700 = $$$3484699;$$4502 = $$3501649;
     }
     $174 = $150 ? $$561 : $$$3484700;
     $175 = $$4502;
     $176 = $174;
     $177 = (($175) - ($176))|0;
     $178 = $177 >> 2;
     $179 = ($178|0)>($149|0);
     $180 = (($174) + ($149<<2)|0);
     $$$4502 = $179 ? $180 : $$4502;
     $181 = HEAP32[$7>>2]|0;
     $182 = (($181) + ($154))|0;
     HEAP32[$7>>2] = $182;
     $183 = ($182|0)<(0);
     if ($183) {
      $$3484650 = $$$3484700;$$3501649 = $$$4502;$152 = $182;
     } else {
      $$3484$lcssa = $$$3484700;$$3501$lcssa = $$$4502;
      break;
     }
    }
   } else {
    $$3484$lcssa = $$1482$lcssa;$$3501$lcssa = $$1499$lcssa;
   }
   $184 = ($$3484$lcssa>>>0)<($$3501$lcssa>>>0);
   $185 = $$561;
   if ($184) {
    $186 = $$3484$lcssa;
    $187 = (($185) - ($186))|0;
    $188 = $187 >> 2;
    $189 = ($188*9)|0;
    $190 = HEAP32[$$3484$lcssa>>2]|0;
    $191 = ($190>>>0)<(10);
    if ($191) {
     $$1515 = $189;
    } else {
     $$0514639 = $189;$$0530638 = 10;
     while(1) {
      $192 = ($$0530638*10)|0;
      $193 = (($$0514639) + 1)|0;
      $194 = ($190>>>0)<($192>>>0);
      if ($194) {
       $$1515 = $193;
       break;
      } else {
       $$0514639 = $193;$$0530638 = $192;
      }
     }
    }
   } else {
    $$1515 = 0;
   }
   $195 = ($39|0)!=(102);
   $196 = $195 ? $$1515 : 0;
   $197 = (($$540) - ($196))|0;
   $198 = ($39|0)==(103);
   $199 = ($$540|0)!=(0);
   $200 = $199 & $198;
   $$neg = $200 << 31 >> 31;
   $201 = (($197) + ($$neg))|0;
   $202 = $$3501$lcssa;
   $203 = (($202) - ($185))|0;
   $204 = $203 >> 2;
   $205 = ($204*9)|0;
   $206 = (($205) + -9)|0;
   $207 = ($201|0)<($206|0);
   if ($207) {
    $208 = ((($$561)) + 4|0);
    $209 = (($201) + 9216)|0;
    $210 = (($209|0) / 9)&-1;
    $211 = (($210) + -1024)|0;
    $212 = (($208) + ($211<<2)|0);
    $213 = (($209|0) % 9)&-1;
    $214 = ($213|0)<(8);
    if ($214) {
     $$0527$in633 = $213;$$1531632 = 10;
     while(1) {
      $$0527 = (($$0527$in633) + 1)|0;
      $215 = ($$1531632*10)|0;
      $216 = ($$0527$in633|0)<(7);
      if ($216) {
       $$0527$in633 = $$0527;$$1531632 = $215;
      } else {
       $$1531$lcssa = $215;
       break;
      }
     }
    } else {
     $$1531$lcssa = 10;
    }
    $217 = HEAP32[$212>>2]|0;
    $218 = (($217>>>0) % ($$1531$lcssa>>>0))&-1;
    $219 = ($218|0)==(0);
    $220 = ((($212)) + 4|0);
    $221 = ($220|0)==($$3501$lcssa|0);
    $or$cond542 = $221 & $219;
    if ($or$cond542) {
     $$4492 = $212;$$4518 = $$1515;$$8 = $$3484$lcssa;
    } else {
     $222 = (($217>>>0) / ($$1531$lcssa>>>0))&-1;
     $223 = $222 & 1;
     $224 = ($223|0)==(0);
     $$543 = $224 ? 9007199254740992.0 : 9007199254740994.0;
     $225 = (($$1531$lcssa|0) / 2)&-1;
     $226 = ($218>>>0)<($225>>>0);
     $227 = ($218|0)==($225|0);
     $or$cond545 = $221 & $227;
     $$564 = $or$cond545 ? 1.0 : 1.5;
     $$$564 = $226 ? 0.5 : $$564;
     $228 = ($$0520|0)==(0);
     if ($228) {
      $$1467 = $$$564;$$1469 = $$543;
     } else {
      $229 = HEAP8[$$0521>>0]|0;
      $230 = ($229<<24>>24)==(45);
      $231 = - $$543;
      $232 = - $$$564;
      $$$543 = $230 ? $231 : $$543;
      $$$$564 = $230 ? $232 : $$$564;
      $$1467 = $$$$564;$$1469 = $$$543;
     }
     $233 = (($217) - ($218))|0;
     HEAP32[$212>>2] = $233;
     $234 = $$1469 + $$1467;
     $235 = $234 != $$1469;
     if ($235) {
      $236 = (($233) + ($$1531$lcssa))|0;
      HEAP32[$212>>2] = $236;
      $237 = ($236>>>0)>(999999999);
      if ($237) {
       $$5486626 = $$3484$lcssa;$$sink547625 = $212;
       while(1) {
        $238 = ((($$sink547625)) + -4|0);
        HEAP32[$$sink547625>>2] = 0;
        $239 = ($238>>>0)<($$5486626>>>0);
        if ($239) {
         $240 = ((($$5486626)) + -4|0);
         HEAP32[$240>>2] = 0;
         $$6 = $240;
        } else {
         $$6 = $$5486626;
        }
        $241 = HEAP32[$238>>2]|0;
        $242 = (($241) + 1)|0;
        HEAP32[$238>>2] = $242;
        $243 = ($242>>>0)>(999999999);
        if ($243) {
         $$5486626 = $$6;$$sink547625 = $238;
        } else {
         $$5486$lcssa = $$6;$$sink547$lcssa = $238;
         break;
        }
       }
      } else {
       $$5486$lcssa = $$3484$lcssa;$$sink547$lcssa = $212;
      }
      $244 = $$5486$lcssa;
      $245 = (($185) - ($244))|0;
      $246 = $245 >> 2;
      $247 = ($246*9)|0;
      $248 = HEAP32[$$5486$lcssa>>2]|0;
      $249 = ($248>>>0)<(10);
      if ($249) {
       $$4492 = $$sink547$lcssa;$$4518 = $247;$$8 = $$5486$lcssa;
      } else {
       $$2516621 = $247;$$2532620 = 10;
       while(1) {
        $250 = ($$2532620*10)|0;
        $251 = (($$2516621) + 1)|0;
        $252 = ($248>>>0)<($250>>>0);
        if ($252) {
         $$4492 = $$sink547$lcssa;$$4518 = $251;$$8 = $$5486$lcssa;
         break;
        } else {
         $$2516621 = $251;$$2532620 = $250;
        }
       }
      }
     } else {
      $$4492 = $212;$$4518 = $$1515;$$8 = $$3484$lcssa;
     }
    }
    $253 = ((($$4492)) + 4|0);
    $254 = ($$3501$lcssa>>>0)>($253>>>0);
    $$$3501 = $254 ? $253 : $$3501$lcssa;
    $$5519$ph = $$4518;$$7505$ph = $$$3501;$$9$ph = $$8;
   } else {
    $$5519$ph = $$1515;$$7505$ph = $$3501$lcssa;$$9$ph = $$3484$lcssa;
   }
   $$7505 = $$7505$ph;
   while(1) {
    $255 = ($$7505>>>0)>($$9$ph>>>0);
    if (!($255)) {
     $$lcssa675 = 0;
     break;
    }
    $256 = ((($$7505)) + -4|0);
    $257 = HEAP32[$256>>2]|0;
    $258 = ($257|0)==(0);
    if ($258) {
     $$7505 = $256;
    } else {
     $$lcssa675 = 1;
     break;
    }
   }
   $259 = (0 - ($$5519$ph))|0;
   do {
    if ($198) {
     $not$ = $199 ^ 1;
     $260 = $not$&1;
     $$540$ = (($$540) + ($260))|0;
     $261 = ($$540$|0)>($$5519$ph|0);
     $262 = ($$5519$ph|0)>(-5);
     $or$cond6 = $261 & $262;
     if ($or$cond6) {
      $263 = (($5) + -1)|0;
      $$neg568 = (($$540$) + -1)|0;
      $264 = (($$neg568) - ($$5519$ph))|0;
      $$0479 = $263;$$2476 = $264;
     } else {
      $265 = (($5) + -2)|0;
      $266 = (($$540$) + -1)|0;
      $$0479 = $265;$$2476 = $266;
     }
     $267 = $4 & 8;
     $268 = ($267|0)==(0);
     if ($268) {
      if ($$lcssa675) {
       $269 = ((($$7505)) + -4|0);
       $270 = HEAP32[$269>>2]|0;
       $271 = ($270|0)==(0);
       if ($271) {
        $$2529 = 9;
       } else {
        $272 = (($270>>>0) % 10)&-1;
        $273 = ($272|0)==(0);
        if ($273) {
         $$1528617 = 0;$$3533616 = 10;
         while(1) {
          $274 = ($$3533616*10)|0;
          $275 = (($$1528617) + 1)|0;
          $276 = (($270>>>0) % ($274>>>0))&-1;
          $277 = ($276|0)==(0);
          if ($277) {
           $$1528617 = $275;$$3533616 = $274;
          } else {
           $$2529 = $275;
           break;
          }
         }
        } else {
         $$2529 = 0;
        }
       }
      } else {
       $$2529 = 9;
      }
      $278 = $$0479 | 32;
      $279 = ($278|0)==(102);
      $280 = $$7505;
      $281 = (($280) - ($185))|0;
      $282 = $281 >> 2;
      $283 = ($282*9)|0;
      $284 = (($283) + -9)|0;
      if ($279) {
       $285 = (($284) - ($$2529))|0;
       $286 = ($285|0)>(0);
       $$548 = $286 ? $285 : 0;
       $287 = ($$2476|0)<($$548|0);
       $$2476$$549 = $287 ? $$2476 : $$548;
       $$1480 = $$0479;$$3477 = $$2476$$549;$$pre$phi698Z2D = 0;
       break;
      } else {
       $288 = (($284) + ($$5519$ph))|0;
       $289 = (($288) - ($$2529))|0;
       $290 = ($289|0)>(0);
       $$550 = $290 ? $289 : 0;
       $291 = ($$2476|0)<($$550|0);
       $$2476$$551 = $291 ? $$2476 : $$550;
       $$1480 = $$0479;$$3477 = $$2476$$551;$$pre$phi698Z2D = 0;
       break;
      }
     } else {
      $$1480 = $$0479;$$3477 = $$2476;$$pre$phi698Z2D = $267;
     }
    } else {
     $$pre697 = $4 & 8;
     $$1480 = $5;$$3477 = $$540;$$pre$phi698Z2D = $$pre697;
    }
   } while(0);
   $292 = $$3477 | $$pre$phi698Z2D;
   $293 = ($292|0)!=(0);
   $294 = $293&1;
   $295 = $$1480 | 32;
   $296 = ($295|0)==(102);
   if ($296) {
    $297 = ($$5519$ph|0)>(0);
    $298 = $297 ? $$5519$ph : 0;
    $$2513 = 0;$$pn = $298;
   } else {
    $299 = ($$5519$ph|0)<(0);
    $300 = $299 ? $259 : $$5519$ph;
    $301 = ($300|0)<(0);
    $302 = $301 << 31 >> 31;
    $303 = (_fmt_u($300,$302,$11)|0);
    $304 = $11;
    $305 = $303;
    $306 = (($304) - ($305))|0;
    $307 = ($306|0)<(2);
    if ($307) {
     $$1512610 = $303;
     while(1) {
      $308 = ((($$1512610)) + -1|0);
      HEAP8[$308>>0] = 48;
      $309 = $308;
      $310 = (($304) - ($309))|0;
      $311 = ($310|0)<(2);
      if ($311) {
       $$1512610 = $308;
      } else {
       $$1512$lcssa = $308;
       break;
      }
     }
    } else {
     $$1512$lcssa = $303;
    }
    $312 = $$5519$ph >> 31;
    $313 = $312 & 2;
    $314 = (($313) + 43)|0;
    $315 = $314&255;
    $316 = ((($$1512$lcssa)) + -1|0);
    HEAP8[$316>>0] = $315;
    $317 = $$1480&255;
    $318 = ((($$1512$lcssa)) + -2|0);
    HEAP8[$318>>0] = $317;
    $319 = $318;
    $320 = (($304) - ($319))|0;
    $$2513 = $318;$$pn = $320;
   }
   $321 = (($$0520) + 1)|0;
   $322 = (($321) + ($$3477))|0;
   $$1526 = (($322) + ($294))|0;
   $323 = (($$1526) + ($$pn))|0;
   _pad_234($0,32,$2,$323,$4);
   _out_228($0,$$0521,$$0520);
   $324 = $4 ^ 65536;
   _pad_234($0,48,$2,$323,$324);
   if ($296) {
    $325 = ($$9$ph>>>0)>($$561>>>0);
    $$0496$$9 = $325 ? $$561 : $$9$ph;
    $326 = ((($8)) + 9|0);
    $327 = $326;
    $328 = ((($8)) + 8|0);
    $$5493600 = $$0496$$9;
    while(1) {
     $329 = HEAP32[$$5493600>>2]|0;
     $330 = (_fmt_u($329,0,$326)|0);
     $331 = ($$5493600|0)==($$0496$$9|0);
     if ($331) {
      $337 = ($330|0)==($326|0);
      if ($337) {
       HEAP8[$328>>0] = 48;
       $$1465 = $328;
      } else {
       $$1465 = $330;
      }
     } else {
      $332 = ($330>>>0)>($8>>>0);
      if ($332) {
       $333 = $330;
       $334 = (($333) - ($9))|0;
       _memset(($8|0),48,($334|0))|0;
       $$0464597 = $330;
       while(1) {
        $335 = ((($$0464597)) + -1|0);
        $336 = ($335>>>0)>($8>>>0);
        if ($336) {
         $$0464597 = $335;
        } else {
         $$1465 = $335;
         break;
        }
       }
      } else {
       $$1465 = $330;
      }
     }
     $338 = $$1465;
     $339 = (($327) - ($338))|0;
     _out_228($0,$$1465,$339);
     $340 = ((($$5493600)) + 4|0);
     $341 = ($340>>>0)>($$561>>>0);
     if ($341) {
      break;
     } else {
      $$5493600 = $340;
     }
    }
    $342 = ($292|0)==(0);
    if (!($342)) {
     _out_228($0,8671,1);
    }
    $343 = ($340>>>0)<($$7505>>>0);
    $344 = ($$3477|0)>(0);
    $345 = $343 & $344;
    if ($345) {
     $$4478593 = $$3477;$$6494592 = $340;
     while(1) {
      $346 = HEAP32[$$6494592>>2]|0;
      $347 = (_fmt_u($346,0,$326)|0);
      $348 = ($347>>>0)>($8>>>0);
      if ($348) {
       $349 = $347;
       $350 = (($349) - ($9))|0;
       _memset(($8|0),48,($350|0))|0;
       $$0463587 = $347;
       while(1) {
        $351 = ((($$0463587)) + -1|0);
        $352 = ($351>>>0)>($8>>>0);
        if ($352) {
         $$0463587 = $351;
        } else {
         $$0463$lcssa = $351;
         break;
        }
       }
      } else {
       $$0463$lcssa = $347;
      }
      $353 = ($$4478593|0)<(9);
      $354 = $353 ? $$4478593 : 9;
      _out_228($0,$$0463$lcssa,$354);
      $355 = ((($$6494592)) + 4|0);
      $356 = (($$4478593) + -9)|0;
      $357 = ($355>>>0)<($$7505>>>0);
      $358 = ($$4478593|0)>(9);
      $359 = $357 & $358;
      if ($359) {
       $$4478593 = $356;$$6494592 = $355;
      } else {
       $$4478$lcssa = $356;
       break;
      }
     }
    } else {
     $$4478$lcssa = $$3477;
    }
    $360 = (($$4478$lcssa) + 9)|0;
    _pad_234($0,48,$360,9,0);
   } else {
    $361 = ((($$9$ph)) + 4|0);
    $$7505$ = $$lcssa675 ? $$7505 : $361;
    $362 = ($$3477|0)>(-1);
    if ($362) {
     $363 = ((($8)) + 9|0);
     $364 = ($$pre$phi698Z2D|0)==(0);
     $365 = $363;
     $366 = (0 - ($9))|0;
     $367 = ((($8)) + 8|0);
     $$5605 = $$3477;$$7495604 = $$9$ph;
     while(1) {
      $368 = HEAP32[$$7495604>>2]|0;
      $369 = (_fmt_u($368,0,$363)|0);
      $370 = ($369|0)==($363|0);
      if ($370) {
       HEAP8[$367>>0] = 48;
       $$0 = $367;
      } else {
       $$0 = $369;
      }
      $371 = ($$7495604|0)==($$9$ph|0);
      do {
       if ($371) {
        $375 = ((($$0)) + 1|0);
        _out_228($0,$$0,1);
        $376 = ($$5605|0)<(1);
        $or$cond556 = $364 & $376;
        if ($or$cond556) {
         $$2 = $375;
         break;
        }
        _out_228($0,8671,1);
        $$2 = $375;
       } else {
        $372 = ($$0>>>0)>($8>>>0);
        if (!($372)) {
         $$2 = $$0;
         break;
        }
        $scevgep686 = (($$0) + ($366)|0);
        $scevgep686687 = $scevgep686;
        _memset(($8|0),48,($scevgep686687|0))|0;
        $$1601 = $$0;
        while(1) {
         $373 = ((($$1601)) + -1|0);
         $374 = ($373>>>0)>($8>>>0);
         if ($374) {
          $$1601 = $373;
         } else {
          $$2 = $373;
          break;
         }
        }
       }
      } while(0);
      $377 = $$2;
      $378 = (($365) - ($377))|0;
      $379 = ($$5605|0)>($378|0);
      $380 = $379 ? $378 : $$5605;
      _out_228($0,$$2,$380);
      $381 = (($$5605) - ($378))|0;
      $382 = ((($$7495604)) + 4|0);
      $383 = ($382>>>0)<($$7505$>>>0);
      $384 = ($381|0)>(-1);
      $385 = $383 & $384;
      if ($385) {
       $$5605 = $381;$$7495604 = $382;
      } else {
       $$5$lcssa = $381;
       break;
      }
     }
    } else {
     $$5$lcssa = $$3477;
    }
    $386 = (($$5$lcssa) + 18)|0;
    _pad_234($0,48,$386,18,0);
    $387 = $11;
    $388 = $$2513;
    $389 = (($387) - ($388))|0;
    _out_228($0,$$2513,$389);
   }
   $390 = $4 ^ 8192;
   _pad_234($0,32,$2,$323,$390);
   $$sink560 = $323;
  }
 } while(0);
 $391 = ($$sink560|0)<($2|0);
 $$557 = $391 ? $2 : $$sink560;
 STACKTOP = sp;return ($$557|0);
}
function ___DOUBLE_BITS_235($0) {
 $0 = +$0;
 var $1 = 0, $2 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 HEAPF64[tempDoublePtr>>3] = $0;$1 = HEAP32[tempDoublePtr>>2]|0;
 $2 = HEAP32[tempDoublePtr+4>>2]|0;
 tempRet0 = ($2);
 return ($1|0);
}
function _frexpl($0,$1) {
 $0 = +$0;
 $1 = $1|0;
 var $2 = 0.0, label = 0, sp = 0;
 sp = STACKTOP;
 $2 = (+_frexp($0,$1));
 return (+$2);
}
function _frexp($0,$1) {
 $0 = +$0;
 $1 = $1|0;
 var $$0 = 0.0, $$016 = 0.0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0.0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0.0, $9 = 0.0, $storemerge = 0, $trunc$clear = 0, label = 0;
 var sp = 0;
 sp = STACKTOP;
 HEAPF64[tempDoublePtr>>3] = $0;$2 = HEAP32[tempDoublePtr>>2]|0;
 $3 = HEAP32[tempDoublePtr+4>>2]|0;
 $4 = (_bitshift64Lshr(($2|0),($3|0),52)|0);
 $5 = tempRet0;
 $6 = $4&65535;
 $trunc$clear = $6 & 2047;
 switch ($trunc$clear<<16>>16) {
 case 0:  {
  $7 = $0 != 0.0;
  if ($7) {
   $8 = $0 * 1.8446744073709552E+19;
   $9 = (+_frexp($8,$1));
   $10 = HEAP32[$1>>2]|0;
   $11 = (($10) + -64)|0;
   $$016 = $9;$storemerge = $11;
  } else {
   $$016 = $0;$storemerge = 0;
  }
  HEAP32[$1>>2] = $storemerge;
  $$0 = $$016;
  break;
 }
 case 2047:  {
  $$0 = $0;
  break;
 }
 default: {
  $12 = $4 & 2047;
  $13 = (($12) + -1022)|0;
  HEAP32[$1>>2] = $13;
  $14 = $3 & -2146435073;
  $15 = $14 | 1071644672;
  HEAP32[tempDoublePtr>>2] = $2;HEAP32[tempDoublePtr+4>>2] = $15;$16 = +HEAPF64[tempDoublePtr>>3];
  $$0 = $16;
 }
 }
 return (+$$0);
}
function _wcrtomb($0,$1,$2) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 var $$0 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0;
 var $29 = 0, $3 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $4 = 0, $40 = 0, $41 = 0, $42 = 0, $43 = 0, $44 = 0, $45 = 0, $46 = 0;
 var $47 = 0, $48 = 0, $49 = 0, $5 = 0, $50 = 0, $51 = 0, $52 = 0, $53 = 0, $54 = 0, $55 = 0, $56 = 0, $57 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, $or$cond = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $3 = ($0|0)==(0|0);
 do {
  if ($3) {
   $$0 = 1;
  } else {
   $4 = ($1>>>0)<(128);
   if ($4) {
    $5 = $1&255;
    HEAP8[$0>>0] = $5;
    $$0 = 1;
    break;
   }
   $6 = (___pthread_self_351()|0);
   $7 = ((($6)) + 188|0);
   $8 = HEAP32[$7>>2]|0;
   $9 = HEAP32[$8>>2]|0;
   $10 = ($9|0)==(0|0);
   if ($10) {
    $11 = $1 & -128;
    $12 = ($11|0)==(57216);
    if ($12) {
     $14 = $1&255;
     HEAP8[$0>>0] = $14;
     $$0 = 1;
     break;
    } else {
     $13 = (___errno_location()|0);
     HEAP32[$13>>2] = 84;
     $$0 = -1;
     break;
    }
   }
   $15 = ($1>>>0)<(2048);
   if ($15) {
    $16 = $1 >>> 6;
    $17 = $16 | 192;
    $18 = $17&255;
    $19 = ((($0)) + 1|0);
    HEAP8[$0>>0] = $18;
    $20 = $1 & 63;
    $21 = $20 | 128;
    $22 = $21&255;
    HEAP8[$19>>0] = $22;
    $$0 = 2;
    break;
   }
   $23 = ($1>>>0)<(55296);
   $24 = $1 & -8192;
   $25 = ($24|0)==(57344);
   $or$cond = $23 | $25;
   if ($or$cond) {
    $26 = $1 >>> 12;
    $27 = $26 | 224;
    $28 = $27&255;
    $29 = ((($0)) + 1|0);
    HEAP8[$0>>0] = $28;
    $30 = $1 >>> 6;
    $31 = $30 & 63;
    $32 = $31 | 128;
    $33 = $32&255;
    $34 = ((($0)) + 2|0);
    HEAP8[$29>>0] = $33;
    $35 = $1 & 63;
    $36 = $35 | 128;
    $37 = $36&255;
    HEAP8[$34>>0] = $37;
    $$0 = 3;
    break;
   }
   $38 = (($1) + -65536)|0;
   $39 = ($38>>>0)<(1048576);
   if ($39) {
    $40 = $1 >>> 18;
    $41 = $40 | 240;
    $42 = $41&255;
    $43 = ((($0)) + 1|0);
    HEAP8[$0>>0] = $42;
    $44 = $1 >>> 12;
    $45 = $44 & 63;
    $46 = $45 | 128;
    $47 = $46&255;
    $48 = ((($0)) + 2|0);
    HEAP8[$43>>0] = $47;
    $49 = $1 >>> 6;
    $50 = $49 & 63;
    $51 = $50 | 128;
    $52 = $51&255;
    $53 = ((($0)) + 3|0);
    HEAP8[$48>>0] = $52;
    $54 = $1 & 63;
    $55 = $54 | 128;
    $56 = $55&255;
    HEAP8[$53>>0] = $56;
    $$0 = 4;
    break;
   } else {
    $57 = (___errno_location()|0);
    HEAP32[$57>>2] = 84;
    $$0 = -1;
    break;
   }
  }
 } while(0);
 return ($$0|0);
}
function ___pthread_self_351() {
 var $0 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $0 = (_pthread_self()|0);
 return ($0|0);
}
function ___pthread_self_376() {
 var $0 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $0 = (_pthread_self()|0);
 return ($0|0);
}
function ___strerror_l($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $$012$lcssa = 0, $$01214 = 0, $$016 = 0, $$113 = 0, $$115 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0;
 var label = 0, sp = 0;
 sp = STACKTOP;
 $$016 = 0;
 while(1) {
  $3 = (8673 + ($$016)|0);
  $4 = HEAP8[$3>>0]|0;
  $5 = $4&255;
  $6 = ($5|0)==($0|0);
  if ($6) {
   label = 2;
   break;
  }
  $7 = (($$016) + 1)|0;
  $8 = ($7|0)==(87);
  if ($8) {
   $$01214 = 8761;$$115 = 87;
   label = 5;
   break;
  } else {
   $$016 = $7;
  }
 }
 if ((label|0) == 2) {
  $2 = ($$016|0)==(0);
  if ($2) {
   $$012$lcssa = 8761;
  } else {
   $$01214 = 8761;$$115 = $$016;
   label = 5;
  }
 }
 if ((label|0) == 5) {
  while(1) {
   label = 0;
   $$113 = $$01214;
   while(1) {
    $9 = HEAP8[$$113>>0]|0;
    $10 = ($9<<24>>24)==(0);
    $11 = ((($$113)) + 1|0);
    if ($10) {
     break;
    } else {
     $$113 = $11;
    }
   }
   $12 = (($$115) + -1)|0;
   $13 = ($12|0)==(0);
   if ($13) {
    $$012$lcssa = $11;
    break;
   } else {
    $$01214 = $11;$$115 = $12;
    label = 5;
   }
  }
 }
 $14 = ((($1)) + 20|0);
 $15 = HEAP32[$14>>2]|0;
 $16 = (___lctrans($$012$lcssa,$15)|0);
 return ($16|0);
}
function ___lctrans($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $2 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $2 = (___lctrans_impl($0,$1)|0);
 return ($2|0);
}
function ___lctrans_impl($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $$0 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $2 = ($1|0)==(0|0);
 if ($2) {
  $$0 = 0;
 } else {
  $3 = HEAP32[$1>>2]|0;
  $4 = ((($1)) + 4|0);
  $5 = HEAP32[$4>>2]|0;
  $6 = (___mo_lookup($3,$5,$0)|0);
  $$0 = $6;
 }
 $7 = ($$0|0)!=(0|0);
 $8 = $7 ? $$0 : $0;
 return ($8|0);
}
function ___mo_lookup($0,$1,$2) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 var $$ = 0, $$090 = 0, $$094 = 0, $$191 = 0, $$195 = 0, $$4 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0;
 var $24 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0, $29 = 0, $3 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $4 = 0, $40 = 0, $41 = 0;
 var $42 = 0, $43 = 0, $44 = 0, $45 = 0, $46 = 0, $47 = 0, $48 = 0, $49 = 0, $5 = 0, $50 = 0, $51 = 0, $52 = 0, $53 = 0, $54 = 0, $55 = 0, $56 = 0, $57 = 0, $58 = 0, $59 = 0, $6 = 0;
 var $60 = 0, $61 = 0, $62 = 0, $63 = 0, $64 = 0, $7 = 0, $8 = 0, $9 = 0, $or$cond = 0, $or$cond102 = 0, $or$cond104 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $3 = HEAP32[$0>>2]|0;
 $4 = (($3) + 1794895138)|0;
 $5 = ((($0)) + 8|0);
 $6 = HEAP32[$5>>2]|0;
 $7 = (_swapc($6,$4)|0);
 $8 = ((($0)) + 12|0);
 $9 = HEAP32[$8>>2]|0;
 $10 = (_swapc($9,$4)|0);
 $11 = ((($0)) + 16|0);
 $12 = HEAP32[$11>>2]|0;
 $13 = (_swapc($12,$4)|0);
 $14 = $1 >>> 2;
 $15 = ($7>>>0)<($14>>>0);
 L1: do {
  if ($15) {
   $16 = $7 << 2;
   $17 = (($1) - ($16))|0;
   $18 = ($10>>>0)<($17>>>0);
   $19 = ($13>>>0)<($17>>>0);
   $or$cond = $18 & $19;
   if ($or$cond) {
    $20 = $13 | $10;
    $21 = $20 & 3;
    $22 = ($21|0)==(0);
    if ($22) {
     $23 = $10 >>> 2;
     $24 = $13 >>> 2;
     $$090 = 0;$$094 = $7;
     while(1) {
      $25 = $$094 >>> 1;
      $26 = (($$090) + ($25))|0;
      $27 = $26 << 1;
      $28 = (($27) + ($23))|0;
      $29 = (($0) + ($28<<2)|0);
      $30 = HEAP32[$29>>2]|0;
      $31 = (_swapc($30,$4)|0);
      $32 = (($28) + 1)|0;
      $33 = (($0) + ($32<<2)|0);
      $34 = HEAP32[$33>>2]|0;
      $35 = (_swapc($34,$4)|0);
      $36 = ($35>>>0)<($1>>>0);
      $37 = (($1) - ($35))|0;
      $38 = ($31>>>0)<($37>>>0);
      $or$cond102 = $36 & $38;
      if (!($or$cond102)) {
       $$4 = 0;
       break L1;
      }
      $39 = (($35) + ($31))|0;
      $40 = (($0) + ($39)|0);
      $41 = HEAP8[$40>>0]|0;
      $42 = ($41<<24>>24)==(0);
      if (!($42)) {
       $$4 = 0;
       break L1;
      }
      $43 = (($0) + ($35)|0);
      $44 = (_strcmp($2,$43)|0);
      $45 = ($44|0)==(0);
      if ($45) {
       break;
      }
      $62 = ($$094|0)==(1);
      $63 = ($44|0)<(0);
      $64 = (($$094) - ($25))|0;
      $$195 = $63 ? $25 : $64;
      $$191 = $63 ? $$090 : $26;
      if ($62) {
       $$4 = 0;
       break L1;
      } else {
       $$090 = $$191;$$094 = $$195;
      }
     }
     $46 = (($27) + ($24))|0;
     $47 = (($0) + ($46<<2)|0);
     $48 = HEAP32[$47>>2]|0;
     $49 = (_swapc($48,$4)|0);
     $50 = (($46) + 1)|0;
     $51 = (($0) + ($50<<2)|0);
     $52 = HEAP32[$51>>2]|0;
     $53 = (_swapc($52,$4)|0);
     $54 = ($53>>>0)<($1>>>0);
     $55 = (($1) - ($53))|0;
     $56 = ($49>>>0)<($55>>>0);
     $or$cond104 = $54 & $56;
     if ($or$cond104) {
      $57 = (($0) + ($53)|0);
      $58 = (($53) + ($49))|0;
      $59 = (($0) + ($58)|0);
      $60 = HEAP8[$59>>0]|0;
      $61 = ($60<<24>>24)==(0);
      $$ = $61 ? $57 : 0;
      $$4 = $$;
     } else {
      $$4 = 0;
     }
    } else {
     $$4 = 0;
    }
   } else {
    $$4 = 0;
   }
  } else {
   $$4 = 0;
  }
 } while(0);
 return ($$4|0);
}
function _swapc($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $$ = 0, $2 = 0, $3 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $2 = ($1|0)==(0);
 $3 = (_llvm_bswap_i32(($0|0))|0);
 $$ = $2 ? $0 : $3;
 return ($$|0);
}
function ___fwritex($0,$1,$2) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 var $$038 = 0, $$042 = 0, $$1 = 0, $$139 = 0, $$141 = 0, $$143 = 0, $$pre = 0, $$pre47 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $20 = 0, $21 = 0;
 var $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0, $29 = 0, $3 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0;
 var label = 0, sp = 0;
 sp = STACKTOP;
 $3 = ((($2)) + 16|0);
 $4 = HEAP32[$3>>2]|0;
 $5 = ($4|0)==(0|0);
 if ($5) {
  $7 = (___towrite($2)|0);
  $8 = ($7|0)==(0);
  if ($8) {
   $$pre = HEAP32[$3>>2]|0;
   $12 = $$pre;
   label = 5;
  } else {
   $$1 = 0;
  }
 } else {
  $6 = $4;
  $12 = $6;
  label = 5;
 }
 L5: do {
  if ((label|0) == 5) {
   $9 = ((($2)) + 20|0);
   $10 = HEAP32[$9>>2]|0;
   $11 = (($12) - ($10))|0;
   $13 = ($11>>>0)<($1>>>0);
   $14 = $10;
   if ($13) {
    $15 = ((($2)) + 36|0);
    $16 = HEAP32[$15>>2]|0;
    $17 = (FUNCTION_TABLE_iiii[$16 & 7]($2,$0,$1)|0);
    $$1 = $17;
    break;
   }
   $18 = ((($2)) + 75|0);
   $19 = HEAP8[$18>>0]|0;
   $20 = ($19<<24>>24)>(-1);
   L10: do {
    if ($20) {
     $$038 = $1;
     while(1) {
      $21 = ($$038|0)==(0);
      if ($21) {
       $$139 = 0;$$141 = $0;$$143 = $1;$31 = $14;
       break L10;
      }
      $22 = (($$038) + -1)|0;
      $23 = (($0) + ($22)|0);
      $24 = HEAP8[$23>>0]|0;
      $25 = ($24<<24>>24)==(10);
      if ($25) {
       break;
      } else {
       $$038 = $22;
      }
     }
     $26 = ((($2)) + 36|0);
     $27 = HEAP32[$26>>2]|0;
     $28 = (FUNCTION_TABLE_iiii[$27 & 7]($2,$0,$$038)|0);
     $29 = ($28>>>0)<($$038>>>0);
     if ($29) {
      $$1 = $28;
      break L5;
     }
     $30 = (($0) + ($$038)|0);
     $$042 = (($1) - ($$038))|0;
     $$pre47 = HEAP32[$9>>2]|0;
     $$139 = $$038;$$141 = $30;$$143 = $$042;$31 = $$pre47;
    } else {
     $$139 = 0;$$141 = $0;$$143 = $1;$31 = $14;
    }
   } while(0);
   (_memcpy(($31|0),($$141|0),($$143|0))|0);
   $32 = HEAP32[$9>>2]|0;
   $33 = (($32) + ($$143)|0);
   HEAP32[$9>>2] = $33;
   $34 = (($$139) + ($$143))|0;
   $$1 = $34;
  }
 } while(0);
 return ($$1|0);
}
function ___towrite($0) {
 $0 = $0|0;
 var $$0 = 0, $1 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0;
 var $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $1 = ((($0)) + 74|0);
 $2 = HEAP8[$1>>0]|0;
 $3 = $2 << 24 >> 24;
 $4 = (($3) + 255)|0;
 $5 = $4 | $3;
 $6 = $5&255;
 HEAP8[$1>>0] = $6;
 $7 = HEAP32[$0>>2]|0;
 $8 = $7 & 8;
 $9 = ($8|0)==(0);
 if ($9) {
  $11 = ((($0)) + 8|0);
  HEAP32[$11>>2] = 0;
  $12 = ((($0)) + 4|0);
  HEAP32[$12>>2] = 0;
  $13 = ((($0)) + 44|0);
  $14 = HEAP32[$13>>2]|0;
  $15 = ((($0)) + 28|0);
  HEAP32[$15>>2] = $14;
  $16 = ((($0)) + 20|0);
  HEAP32[$16>>2] = $14;
  $17 = $14;
  $18 = ((($0)) + 48|0);
  $19 = HEAP32[$18>>2]|0;
  $20 = (($17) + ($19)|0);
  $21 = ((($0)) + 16|0);
  HEAP32[$21>>2] = $20;
  $$0 = 0;
 } else {
  $10 = $7 | 32;
  HEAP32[$0>>2] = $10;
  $$0 = -1;
 }
 return ($$0|0);
}
function _strchr($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $2 = (___strchrnul($0,$1)|0);
 $3 = HEAP8[$2>>0]|0;
 $4 = $1&255;
 $5 = ($3<<24>>24)==($4<<24>>24);
 $6 = $5 ? $2 : 0;
 return ($6|0);
}
function ___strchrnul($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $$0 = 0, $$029$lcssa = 0, $$02936 = 0, $$030$lcssa = 0, $$03039 = 0, $$1 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0;
 var $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0, $29 = 0, $3 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $4 = 0, $40 = 0;
 var $41 = 0, $42 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, $or$cond = 0, $or$cond33 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $2 = $1 & 255;
 $3 = ($2|0)==(0);
 L1: do {
  if ($3) {
   $8 = (_strlen($0)|0);
   $9 = (($0) + ($8)|0);
   $$0 = $9;
  } else {
   $4 = $0;
   $5 = $4 & 3;
   $6 = ($5|0)==(0);
   if ($6) {
    $$030$lcssa = $0;
   } else {
    $7 = $1&255;
    $$03039 = $0;
    while(1) {
     $10 = HEAP8[$$03039>>0]|0;
     $11 = ($10<<24>>24)==(0);
     $12 = ($10<<24>>24)==($7<<24>>24);
     $or$cond = $11 | $12;
     if ($or$cond) {
      $$0 = $$03039;
      break L1;
     }
     $13 = ((($$03039)) + 1|0);
     $14 = $13;
     $15 = $14 & 3;
     $16 = ($15|0)==(0);
     if ($16) {
      $$030$lcssa = $13;
      break;
     } else {
      $$03039 = $13;
     }
    }
   }
   $17 = Math_imul($2, 16843009)|0;
   $18 = HEAP32[$$030$lcssa>>2]|0;
   $19 = (($18) + -16843009)|0;
   $20 = $18 & -2139062144;
   $21 = $20 ^ -2139062144;
   $22 = $21 & $19;
   $23 = ($22|0)==(0);
   L10: do {
    if ($23) {
     $$02936 = $$030$lcssa;$25 = $18;
     while(1) {
      $24 = $25 ^ $17;
      $26 = (($24) + -16843009)|0;
      $27 = $24 & -2139062144;
      $28 = $27 ^ -2139062144;
      $29 = $28 & $26;
      $30 = ($29|0)==(0);
      if (!($30)) {
       $$029$lcssa = $$02936;
       break L10;
      }
      $31 = ((($$02936)) + 4|0);
      $32 = HEAP32[$31>>2]|0;
      $33 = (($32) + -16843009)|0;
      $34 = $32 & -2139062144;
      $35 = $34 ^ -2139062144;
      $36 = $35 & $33;
      $37 = ($36|0)==(0);
      if ($37) {
       $$02936 = $31;$25 = $32;
      } else {
       $$029$lcssa = $31;
       break;
      }
     }
    } else {
     $$029$lcssa = $$030$lcssa;
    }
   } while(0);
   $38 = $1&255;
   $$1 = $$029$lcssa;
   while(1) {
    $39 = HEAP8[$$1>>0]|0;
    $40 = ($39<<24>>24)==(0);
    $41 = ($39<<24>>24)==($38<<24>>24);
    $or$cond33 = $40 | $41;
    $42 = ((($$1)) + 1|0);
    if ($or$cond33) {
     $$0 = $$1;
     break;
    } else {
     $$1 = $42;
    }
   }
  }
 } while(0);
 return ($$0|0);
}
function _isspace($0) {
 $0 = $0|0;
 var $1 = 0, $2 = 0, $3 = 0, $4 = 0, $narrow = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $1 = ($0|0)==(32);
 $2 = (($0) + -9)|0;
 $3 = ($2>>>0)<(5);
 $narrow = $1 | $3;
 $4 = $narrow&1;
 return ($4|0);
}
function ___ofl_lock() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 ___lock((11132|0));
 return (11140|0);
}
function ___ofl_unlock() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 ___unlock((11132|0));
 return;
}
function _fflush($0) {
 $0 = $0|0;
 var $$0 = 0, $$023 = 0, $$02325 = 0, $$02327 = 0, $$024$lcssa = 0, $$02426 = 0, $$1 = 0, $1 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0;
 var $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0, $29 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, $phitmp = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $1 = ($0|0)==(0|0);
 do {
  if ($1) {
   $8 = HEAP32[53]|0;
   $9 = ($8|0)==(0|0);
   if ($9) {
    $29 = 0;
   } else {
    $10 = HEAP32[53]|0;
    $11 = (_fflush($10)|0);
    $29 = $11;
   }
   $12 = (___ofl_lock()|0);
   $$02325 = HEAP32[$12>>2]|0;
   $13 = ($$02325|0)==(0|0);
   if ($13) {
    $$024$lcssa = $29;
   } else {
    $$02327 = $$02325;$$02426 = $29;
    while(1) {
     $14 = ((($$02327)) + 76|0);
     $15 = HEAP32[$14>>2]|0;
     $16 = ($15|0)>(-1);
     if ($16) {
      $17 = (___lockfile($$02327)|0);
      $25 = $17;
     } else {
      $25 = 0;
     }
     $18 = ((($$02327)) + 20|0);
     $19 = HEAP32[$18>>2]|0;
     $20 = ((($$02327)) + 28|0);
     $21 = HEAP32[$20>>2]|0;
     $22 = ($19>>>0)>($21>>>0);
     if ($22) {
      $23 = (___fflush_unlocked($$02327)|0);
      $24 = $23 | $$02426;
      $$1 = $24;
     } else {
      $$1 = $$02426;
     }
     $26 = ($25|0)==(0);
     if (!($26)) {
      ___unlockfile($$02327);
     }
     $27 = ((($$02327)) + 56|0);
     $$023 = HEAP32[$27>>2]|0;
     $28 = ($$023|0)==(0|0);
     if ($28) {
      $$024$lcssa = $$1;
      break;
     } else {
      $$02327 = $$023;$$02426 = $$1;
     }
    }
   }
   ___ofl_unlock();
   $$0 = $$024$lcssa;
  } else {
   $2 = ((($0)) + 76|0);
   $3 = HEAP32[$2>>2]|0;
   $4 = ($3|0)>(-1);
   if (!($4)) {
    $5 = (___fflush_unlocked($0)|0);
    $$0 = $5;
    break;
   }
   $6 = (___lockfile($0)|0);
   $phitmp = ($6|0)==(0);
   $7 = (___fflush_unlocked($0)|0);
   if ($phitmp) {
    $$0 = $7;
   } else {
    ___unlockfile($0);
    $$0 = $7;
   }
  }
 } while(0);
 return ($$0|0);
}
function ___fflush_unlocked($0) {
 $0 = $0|0;
 var $$0 = 0, $1 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0;
 var $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $1 = ((($0)) + 20|0);
 $2 = HEAP32[$1>>2]|0;
 $3 = ((($0)) + 28|0);
 $4 = HEAP32[$3>>2]|0;
 $5 = ($2>>>0)>($4>>>0);
 if ($5) {
  $6 = ((($0)) + 36|0);
  $7 = HEAP32[$6>>2]|0;
  (FUNCTION_TABLE_iiii[$7 & 7]($0,0,0)|0);
  $8 = HEAP32[$1>>2]|0;
  $9 = ($8|0)==(0|0);
  if ($9) {
   $$0 = -1;
  } else {
   label = 3;
  }
 } else {
  label = 3;
 }
 if ((label|0) == 3) {
  $10 = ((($0)) + 4|0);
  $11 = HEAP32[$10>>2]|0;
  $12 = ((($0)) + 8|0);
  $13 = HEAP32[$12>>2]|0;
  $14 = ($11>>>0)<($13>>>0);
  if ($14) {
   $15 = $11;
   $16 = $13;
   $17 = (($15) - ($16))|0;
   $18 = ((($0)) + 40|0);
   $19 = HEAP32[$18>>2]|0;
   (FUNCTION_TABLE_iiii[$19 & 7]($0,$17,1)|0);
  }
  $20 = ((($0)) + 16|0);
  HEAP32[$20>>2] = 0;
  HEAP32[$3>>2] = 0;
  HEAP32[$1>>2] = 0;
  HEAP32[$12>>2] = 0;
  HEAP32[$10>>2] = 0;
  $$0 = 0;
 }
 return ($$0|0);
}
function _fprintf($0,$1,$varargs) {
 $0 = $0|0;
 $1 = $1|0;
 $varargs = $varargs|0;
 var $2 = 0, $3 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $2 = sp;
 HEAP32[$2>>2] = $varargs;
 $3 = (_vfprintf($0,$1,$2)|0);
 STACKTOP = sp;return ($3|0);
}
function ___overflow($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $$0 = 0, $$pre = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $3 = 0, $4 = 0;
 var $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $2 = sp;
 $3 = $1&255;
 HEAP8[$2>>0] = $3;
 $4 = ((($0)) + 16|0);
 $5 = HEAP32[$4>>2]|0;
 $6 = ($5|0)==(0|0);
 if ($6) {
  $7 = (___towrite($0)|0);
  $8 = ($7|0)==(0);
  if ($8) {
   $$pre = HEAP32[$4>>2]|0;
   $12 = $$pre;
   label = 4;
  } else {
   $$0 = -1;
  }
 } else {
  $12 = $5;
  label = 4;
 }
 do {
  if ((label|0) == 4) {
   $9 = ((($0)) + 20|0);
   $10 = HEAP32[$9>>2]|0;
   $11 = ($10>>>0)<($12>>>0);
   if ($11) {
    $13 = $1 & 255;
    $14 = ((($0)) + 75|0);
    $15 = HEAP8[$14>>0]|0;
    $16 = $15 << 24 >> 24;
    $17 = ($13|0)==($16|0);
    if (!($17)) {
     $18 = ((($10)) + 1|0);
     HEAP32[$9>>2] = $18;
     HEAP8[$10>>0] = $3;
     $$0 = $13;
     break;
    }
   }
   $19 = ((($0)) + 36|0);
   $20 = HEAP32[$19>>2]|0;
   $21 = (FUNCTION_TABLE_iiii[$20 & 7]($0,$2,1)|0);
   $22 = ($21|0)==(1);
   if ($22) {
    $23 = HEAP8[$2>>0]|0;
    $24 = $23&255;
    $$0 = $24;
   } else {
    $$0 = -1;
   }
  }
 } while(0);
 STACKTOP = sp;return ($$0|0);
}
function _perror($0) {
 $0 = $0|0;
 var $1 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $1 = HEAP32[54]|0;
 $2 = (___errno_location()|0);
 $3 = HEAP32[$2>>2]|0;
 $4 = (_strerror($3)|0);
 $5 = ((($1)) + 76|0);
 $6 = HEAP32[$5>>2]|0;
 $7 = ($6|0)>(-1);
 if ($7) {
  $8 = (___lockfile($1)|0);
  $14 = $8;
 } else {
  $14 = 0;
 }
 $9 = ($0|0)==(0|0);
 if (!($9)) {
  $10 = HEAP8[$0>>0]|0;
  $11 = ($10<<24>>24)==(0);
  if (!($11)) {
   $12 = (_strlen($0)|0);
   (_fwrite($0,$12,1,$1)|0);
   (_fputc(58,$1)|0);
   (_fputc(32,$1)|0);
  }
 }
 $13 = (_strlen($4)|0);
 (_fwrite($4,$13,1,$1)|0);
 (_fputc(10,$1)|0);
 $15 = ($14|0)==(0);
 if (!($15)) {
  ___unlockfile($1);
 }
 return;
}
function _fwrite($0,$1,$2,$3) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 $3 = $3|0;
 var $$ = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, $phitmp = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $4 = Math_imul($2, $1)|0;
 $5 = ($1|0)==(0);
 $$ = $5 ? 0 : $2;
 $6 = ((($3)) + 76|0);
 $7 = HEAP32[$6>>2]|0;
 $8 = ($7|0)>(-1);
 if ($8) {
  $10 = (___lockfile($3)|0);
  $phitmp = ($10|0)==(0);
  $11 = (___fwritex($0,$4,$3)|0);
  if ($phitmp) {
   $12 = $11;
  } else {
   ___unlockfile($3);
   $12 = $11;
  }
 } else {
  $9 = (___fwritex($0,$4,$3)|0);
  $12 = $9;
 }
 $13 = ($12|0)==($4|0);
 if ($13) {
  $15 = $$;
 } else {
  $14 = (($12>>>0) / ($1>>>0))&-1;
  $15 = $14;
 }
 return ($15|0);
}
function _fputc($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $$0 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0;
 var $28 = 0, $29 = 0, $3 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $2 = ((($1)) + 76|0);
 $3 = HEAP32[$2>>2]|0;
 $4 = ($3|0)<(0);
 if ($4) {
  label = 3;
 } else {
  $5 = (___lockfile($1)|0);
  $6 = ($5|0)==(0);
  if ($6) {
   label = 3;
  } else {
   $20 = $0&255;
   $21 = $0 & 255;
   $22 = ((($1)) + 75|0);
   $23 = HEAP8[$22>>0]|0;
   $24 = $23 << 24 >> 24;
   $25 = ($21|0)==($24|0);
   if ($25) {
    label = 10;
   } else {
    $26 = ((($1)) + 20|0);
    $27 = HEAP32[$26>>2]|0;
    $28 = ((($1)) + 16|0);
    $29 = HEAP32[$28>>2]|0;
    $30 = ($27>>>0)<($29>>>0);
    if ($30) {
     $31 = ((($27)) + 1|0);
     HEAP32[$26>>2] = $31;
     HEAP8[$27>>0] = $20;
     $33 = $21;
    } else {
     label = 10;
    }
   }
   if ((label|0) == 10) {
    $32 = (___overflow($1,$0)|0);
    $33 = $32;
   }
   ___unlockfile($1);
   $$0 = $33;
  }
 }
 do {
  if ((label|0) == 3) {
   $7 = $0&255;
   $8 = $0 & 255;
   $9 = ((($1)) + 75|0);
   $10 = HEAP8[$9>>0]|0;
   $11 = $10 << 24 >> 24;
   $12 = ($8|0)==($11|0);
   if (!($12)) {
    $13 = ((($1)) + 20|0);
    $14 = HEAP32[$13>>2]|0;
    $15 = ((($1)) + 16|0);
    $16 = HEAP32[$15>>2]|0;
    $17 = ($14>>>0)<($16>>>0);
    if ($17) {
     $18 = ((($14)) + 1|0);
     HEAP32[$13>>2] = $18;
     HEAP8[$14>>0] = $7;
     $$0 = $8;
     break;
    }
   }
   $19 = (___overflow($1,$0)|0);
   $$0 = $19;
  }
 } while(0);
 return ($$0|0);
}
function _fputs($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $2 = 0, $3 = 0, $4 = 0, $5 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $2 = (_strlen($0)|0);
 $3 = (_fwrite($0,1,$2,$1)|0);
 $4 = ($3|0)!=($2|0);
 $5 = $4 << 31 >> 31;
 return ($5|0);
}
function _printf($0,$varargs) {
 $0 = $0|0;
 $varargs = $varargs|0;
 var $1 = 0, $2 = 0, $3 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $1 = sp;
 HEAP32[$1>>2] = $varargs;
 $2 = HEAP32[21]|0;
 $3 = (_vfprintf($2,$0,$1)|0);
 STACKTOP = sp;return ($3|0);
}
function ___stpncpy($0,$1,$2) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 var $$0$lcssa = 0, $$037$lcssa = 0, $$03753 = 0, $$038$lcssa = 0, $$03866 = 0, $$039$lcssa = 0, $$03965 = 0, $$041$lcssa = 0, $$04164 = 0, $$054 = 0, $$1$lcssa = 0, $$140$ph = 0, $$14046 = 0, $$142$ph = 0, $$14245 = 0, $$152 = 0, $$2$ph = 0, $$243 = 0, $$247 = 0, $$3 = 0;
 var $$lcssa = 0, $$pr = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0;
 var $28 = 0, $29 = 0, $3 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, $or$cond = 0, $or$cond63 = 0;
 var label = 0, sp = 0;
 sp = STACKTOP;
 $3 = $1;
 $4 = $0;
 $5 = $3 ^ $4;
 $6 = $5 & 3;
 $7 = ($6|0)==(0);
 L1: do {
  if ($7) {
   $8 = $3 & 3;
   $9 = ($8|0)!=(0);
   $10 = ($2|0)!=(0);
   $or$cond63 = $10 & $9;
   if ($or$cond63) {
    $$03866 = $2;$$03965 = $1;$$04164 = $0;
    while(1) {
     $11 = HEAP8[$$03965>>0]|0;
     HEAP8[$$04164>>0] = $11;
     $12 = ($11<<24>>24)==(0);
     if ($12) {
      $$243 = $$04164;$$3 = $$03866;
      break L1;
     }
     $13 = (($$03866) + -1)|0;
     $14 = ((($$03965)) + 1|0);
     $15 = ((($$04164)) + 1|0);
     $16 = $14;
     $17 = $16 & 3;
     $18 = ($17|0)!=(0);
     $19 = ($13|0)!=(0);
     $or$cond = $19 & $18;
     if ($or$cond) {
      $$03866 = $13;$$03965 = $14;$$04164 = $15;
     } else {
      $$038$lcssa = $13;$$039$lcssa = $14;$$041$lcssa = $15;$$lcssa = $19;
      break;
     }
    }
   } else {
    $$038$lcssa = $2;$$039$lcssa = $1;$$041$lcssa = $0;$$lcssa = $10;
   }
   if ($$lcssa) {
    $$pr = HEAP8[$$039$lcssa>>0]|0;
    $20 = ($$pr<<24>>24)==(0);
    if ($20) {
     $$243 = $$041$lcssa;$$3 = $$038$lcssa;
    } else {
     $21 = ($$038$lcssa>>>0)>(3);
     L10: do {
      if ($21) {
       $$03753 = $$041$lcssa;$$054 = $$039$lcssa;$$152 = $$038$lcssa;
       while(1) {
        $22 = HEAP32[$$054>>2]|0;
        $23 = (($22) + -16843009)|0;
        $24 = $22 & -2139062144;
        $25 = $24 ^ -2139062144;
        $26 = $25 & $23;
        $27 = ($26|0)==(0);
        if (!($27)) {
         $$0$lcssa = $$054;$$037$lcssa = $$03753;$$1$lcssa = $$152;
         break L10;
        }
        HEAP32[$$03753>>2] = $22;
        $28 = (($$152) + -4)|0;
        $29 = ((($$054)) + 4|0);
        $30 = ((($$03753)) + 4|0);
        $31 = ($28>>>0)>(3);
        if ($31) {
         $$03753 = $30;$$054 = $29;$$152 = $28;
        } else {
         $$0$lcssa = $29;$$037$lcssa = $30;$$1$lcssa = $28;
         break;
        }
       }
      } else {
       $$0$lcssa = $$039$lcssa;$$037$lcssa = $$041$lcssa;$$1$lcssa = $$038$lcssa;
      }
     } while(0);
     $$140$ph = $$0$lcssa;$$142$ph = $$037$lcssa;$$2$ph = $$1$lcssa;
     label = 11;
    }
   } else {
    $$243 = $$041$lcssa;$$3 = 0;
   }
  } else {
   $$140$ph = $1;$$142$ph = $0;$$2$ph = $2;
   label = 11;
  }
 } while(0);
 L15: do {
  if ((label|0) == 11) {
   $32 = ($$2$ph|0)==(0);
   if ($32) {
    $$243 = $$142$ph;$$3 = 0;
   } else {
    $$14046 = $$140$ph;$$14245 = $$142$ph;$$247 = $$2$ph;
    while(1) {
     $33 = HEAP8[$$14046>>0]|0;
     HEAP8[$$14245>>0] = $33;
     $34 = ($33<<24>>24)==(0);
     if ($34) {
      $$243 = $$14245;$$3 = $$247;
      break L15;
     }
     $35 = (($$247) + -1)|0;
     $36 = ((($$14046)) + 1|0);
     $37 = ((($$14245)) + 1|0);
     $38 = ($35|0)==(0);
     if ($38) {
      $$243 = $37;$$3 = 0;
      break;
     } else {
      $$14046 = $36;$$14245 = $37;$$247 = $35;
     }
    }
   }
  }
 } while(0);
 (_memset(($$243|0),0,($$3|0))|0);
 return ($$243|0);
}
function _strncpy($0,$1,$2) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 var label = 0, sp = 0;
 sp = STACKTOP;
 (___stpncpy($0,$1,$2)|0);
 return ($0|0);
}
function _isalnum($0) {
 $0 = $0|0;
 var $1 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $phitmp = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $1 = (_isalpha($0)|0);
 $2 = ($1|0)==(0);
 if ($2) {
  $3 = (_isdigit($0)|0);
  $4 = ($3|0)!=(0);
  $phitmp = $4&1;
  $5 = $phitmp;
 } else {
  $5 = 1;
 }
 return ($5|0);
}
function _isalpha($0) {
 $0 = $0|0;
 var $1 = 0, $2 = 0, $3 = 0, $4 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $1 = $0 | 32;
 $2 = (($1) + -97)|0;
 $3 = ($2>>>0)<(26);
 $4 = $3&1;
 return ($4|0);
}
function _isgraph($0) {
 $0 = $0|0;
 var $1 = 0, $2 = 0, $3 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $1 = (($0) + -33)|0;
 $2 = ($1>>>0)<(94);
 $3 = $2&1;
 return ($3|0);
}
function runPostSets() {
}
function _i64Add(a, b, c, d) {
    /*
      x = a + b*2^32
      y = c + d*2^32
      result = l + h*2^32
    */
    a = a|0; b = b|0; c = c|0; d = d|0;
    var l = 0, h = 0;
    l = (a + c)>>>0;
    h = (b + d + (((l>>>0) < (a>>>0))|0))>>>0; // Add carry from low word to high word on overflow.
    return ((tempRet0 = h,l|0)|0);
}
function _i64Subtract(a, b, c, d) {
    a = a|0; b = b|0; c = c|0; d = d|0;
    var l = 0, h = 0;
    l = (a - c)>>>0;
    h = (b - d)>>>0;
    h = (b - d - (((c>>>0) > (a>>>0))|0))>>>0; // Borrow one from high word to low word on underflow.
    return ((tempRet0 = h,l|0)|0);
}
function _llvm_cttz_i32(x) {
    x = x|0;
    var ret = 0;
    ret = ((HEAP8[(((cttz_i8)+(x & 0xff))>>0)])|0);
    if ((ret|0) < 8) return ret|0;
    ret = ((HEAP8[(((cttz_i8)+((x >> 8)&0xff))>>0)])|0);
    if ((ret|0) < 8) return (ret + 8)|0;
    ret = ((HEAP8[(((cttz_i8)+((x >> 16)&0xff))>>0)])|0);
    if ((ret|0) < 8) return (ret + 16)|0;
    return (((HEAP8[(((cttz_i8)+(x >>> 24))>>0)])|0) + 24)|0;
}
function ___udivmoddi4($a$0, $a$1, $b$0, $b$1, $rem) {
    $a$0 = $a$0 | 0;
    $a$1 = $a$1 | 0;
    $b$0 = $b$0 | 0;
    $b$1 = $b$1 | 0;
    $rem = $rem | 0;
    var $n_sroa_0_0_extract_trunc = 0, $n_sroa_1_4_extract_shift$0 = 0, $n_sroa_1_4_extract_trunc = 0, $d_sroa_0_0_extract_trunc = 0, $d_sroa_1_4_extract_shift$0 = 0, $d_sroa_1_4_extract_trunc = 0, $4 = 0, $17 = 0, $37 = 0, $49 = 0, $51 = 0, $57 = 0, $58 = 0, $66 = 0, $78 = 0, $86 = 0, $88 = 0, $89 = 0, $91 = 0, $92 = 0, $95 = 0, $105 = 0, $117 = 0, $119 = 0, $125 = 0, $126 = 0, $130 = 0, $q_sroa_1_1_ph = 0, $q_sroa_0_1_ph = 0, $r_sroa_1_1_ph = 0, $r_sroa_0_1_ph = 0, $sr_1_ph = 0, $d_sroa_0_0_insert_insert99$0 = 0, $d_sroa_0_0_insert_insert99$1 = 0, $137$0 = 0, $137$1 = 0, $carry_0203 = 0, $sr_1202 = 0, $r_sroa_0_1201 = 0, $r_sroa_1_1200 = 0, $q_sroa_0_1199 = 0, $q_sroa_1_1198 = 0, $147 = 0, $149 = 0, $r_sroa_0_0_insert_insert42$0 = 0, $r_sroa_0_0_insert_insert42$1 = 0, $150$1 = 0, $151$0 = 0, $152 = 0, $154$0 = 0, $r_sroa_0_0_extract_trunc = 0, $r_sroa_1_4_extract_trunc = 0, $155 = 0, $carry_0_lcssa$0 = 0, $carry_0_lcssa$1 = 0, $r_sroa_0_1_lcssa = 0, $r_sroa_1_1_lcssa = 0, $q_sroa_0_1_lcssa = 0, $q_sroa_1_1_lcssa = 0, $q_sroa_0_0_insert_ext75$0 = 0, $q_sroa_0_0_insert_ext75$1 = 0, $q_sroa_0_0_insert_insert77$1 = 0, $_0$0 = 0, $_0$1 = 0;
    $n_sroa_0_0_extract_trunc = $a$0;
    $n_sroa_1_4_extract_shift$0 = $a$1;
    $n_sroa_1_4_extract_trunc = $n_sroa_1_4_extract_shift$0;
    $d_sroa_0_0_extract_trunc = $b$0;
    $d_sroa_1_4_extract_shift$0 = $b$1;
    $d_sroa_1_4_extract_trunc = $d_sroa_1_4_extract_shift$0;
    if (($n_sroa_1_4_extract_trunc | 0) == 0) {
      $4 = ($rem | 0) != 0;
      if (($d_sroa_1_4_extract_trunc | 0) == 0) {
        if ($4) {
          HEAP32[$rem >> 2] = ($n_sroa_0_0_extract_trunc >>> 0) % ($d_sroa_0_0_extract_trunc >>> 0);
          HEAP32[$rem + 4 >> 2] = 0;
        }
        $_0$1 = 0;
        $_0$0 = ($n_sroa_0_0_extract_trunc >>> 0) / ($d_sroa_0_0_extract_trunc >>> 0) >>> 0;
        return (tempRet0 = $_0$1, $_0$0) | 0;
      } else {
        if (!$4) {
          $_0$1 = 0;
          $_0$0 = 0;
          return (tempRet0 = $_0$1, $_0$0) | 0;
        }
        HEAP32[$rem >> 2] = $a$0 & -1;
        HEAP32[$rem + 4 >> 2] = $a$1 & 0;
        $_0$1 = 0;
        $_0$0 = 0;
        return (tempRet0 = $_0$1, $_0$0) | 0;
      }
    }
    $17 = ($d_sroa_1_4_extract_trunc | 0) == 0;
    do {
      if (($d_sroa_0_0_extract_trunc | 0) == 0) {
        if ($17) {
          if (($rem | 0) != 0) {
            HEAP32[$rem >> 2] = ($n_sroa_1_4_extract_trunc >>> 0) % ($d_sroa_0_0_extract_trunc >>> 0);
            HEAP32[$rem + 4 >> 2] = 0;
          }
          $_0$1 = 0;
          $_0$0 = ($n_sroa_1_4_extract_trunc >>> 0) / ($d_sroa_0_0_extract_trunc >>> 0) >>> 0;
          return (tempRet0 = $_0$1, $_0$0) | 0;
        }
        if (($n_sroa_0_0_extract_trunc | 0) == 0) {
          if (($rem | 0) != 0) {
            HEAP32[$rem >> 2] = 0;
            HEAP32[$rem + 4 >> 2] = ($n_sroa_1_4_extract_trunc >>> 0) % ($d_sroa_1_4_extract_trunc >>> 0);
          }
          $_0$1 = 0;
          $_0$0 = ($n_sroa_1_4_extract_trunc >>> 0) / ($d_sroa_1_4_extract_trunc >>> 0) >>> 0;
          return (tempRet0 = $_0$1, $_0$0) | 0;
        }
        $37 = $d_sroa_1_4_extract_trunc - 1 | 0;
        if (($37 & $d_sroa_1_4_extract_trunc | 0) == 0) {
          if (($rem | 0) != 0) {
            HEAP32[$rem >> 2] = 0 | $a$0 & -1;
            HEAP32[$rem + 4 >> 2] = $37 & $n_sroa_1_4_extract_trunc | $a$1 & 0;
          }
          $_0$1 = 0;
          $_0$0 = $n_sroa_1_4_extract_trunc >>> ((_llvm_cttz_i32($d_sroa_1_4_extract_trunc | 0) | 0) >>> 0);
          return (tempRet0 = $_0$1, $_0$0) | 0;
        }
        $49 = Math_clz32($d_sroa_1_4_extract_trunc | 0) | 0;
        $51 = $49 - (Math_clz32($n_sroa_1_4_extract_trunc | 0) | 0) | 0;
        if ($51 >>> 0 <= 30) {
          $57 = $51 + 1 | 0;
          $58 = 31 - $51 | 0;
          $sr_1_ph = $57;
          $r_sroa_0_1_ph = $n_sroa_1_4_extract_trunc << $58 | $n_sroa_0_0_extract_trunc >>> ($57 >>> 0);
          $r_sroa_1_1_ph = $n_sroa_1_4_extract_trunc >>> ($57 >>> 0);
          $q_sroa_0_1_ph = 0;
          $q_sroa_1_1_ph = $n_sroa_0_0_extract_trunc << $58;
          break;
        }
        if (($rem | 0) == 0) {
          $_0$1 = 0;
          $_0$0 = 0;
          return (tempRet0 = $_0$1, $_0$0) | 0;
        }
        HEAP32[$rem >> 2] = 0 | $a$0 & -1;
        HEAP32[$rem + 4 >> 2] = $n_sroa_1_4_extract_shift$0 | $a$1 & 0;
        $_0$1 = 0;
        $_0$0 = 0;
        return (tempRet0 = $_0$1, $_0$0) | 0;
      } else {
        if (!$17) {
          $117 = Math_clz32($d_sroa_1_4_extract_trunc | 0) | 0;
          $119 = $117 - (Math_clz32($n_sroa_1_4_extract_trunc | 0) | 0) | 0;
          if ($119 >>> 0 <= 31) {
            $125 = $119 + 1 | 0;
            $126 = 31 - $119 | 0;
            $130 = $119 - 31 >> 31;
            $sr_1_ph = $125;
            $r_sroa_0_1_ph = $n_sroa_0_0_extract_trunc >>> ($125 >>> 0) & $130 | $n_sroa_1_4_extract_trunc << $126;
            $r_sroa_1_1_ph = $n_sroa_1_4_extract_trunc >>> ($125 >>> 0) & $130;
            $q_sroa_0_1_ph = 0;
            $q_sroa_1_1_ph = $n_sroa_0_0_extract_trunc << $126;
            break;
          }
          if (($rem | 0) == 0) {
            $_0$1 = 0;
            $_0$0 = 0;
            return (tempRet0 = $_0$1, $_0$0) | 0;
          }
          HEAP32[$rem >> 2] = 0 | $a$0 & -1;
          HEAP32[$rem + 4 >> 2] = $n_sroa_1_4_extract_shift$0 | $a$1 & 0;
          $_0$1 = 0;
          $_0$0 = 0;
          return (tempRet0 = $_0$1, $_0$0) | 0;
        }
        $66 = $d_sroa_0_0_extract_trunc - 1 | 0;
        if (($66 & $d_sroa_0_0_extract_trunc | 0) != 0) {
          $86 = (Math_clz32($d_sroa_0_0_extract_trunc | 0) | 0) + 33 | 0;
          $88 = $86 - (Math_clz32($n_sroa_1_4_extract_trunc | 0) | 0) | 0;
          $89 = 64 - $88 | 0;
          $91 = 32 - $88 | 0;
          $92 = $91 >> 31;
          $95 = $88 - 32 | 0;
          $105 = $95 >> 31;
          $sr_1_ph = $88;
          $r_sroa_0_1_ph = $91 - 1 >> 31 & $n_sroa_1_4_extract_trunc >>> ($95 >>> 0) | ($n_sroa_1_4_extract_trunc << $91 | $n_sroa_0_0_extract_trunc >>> ($88 >>> 0)) & $105;
          $r_sroa_1_1_ph = $105 & $n_sroa_1_4_extract_trunc >>> ($88 >>> 0);
          $q_sroa_0_1_ph = $n_sroa_0_0_extract_trunc << $89 & $92;
          $q_sroa_1_1_ph = ($n_sroa_1_4_extract_trunc << $89 | $n_sroa_0_0_extract_trunc >>> ($95 >>> 0)) & $92 | $n_sroa_0_0_extract_trunc << $91 & $88 - 33 >> 31;
          break;
        }
        if (($rem | 0) != 0) {
          HEAP32[$rem >> 2] = $66 & $n_sroa_0_0_extract_trunc;
          HEAP32[$rem + 4 >> 2] = 0;
        }
        if (($d_sroa_0_0_extract_trunc | 0) == 1) {
          $_0$1 = $n_sroa_1_4_extract_shift$0 | $a$1 & 0;
          $_0$0 = 0 | $a$0 & -1;
          return (tempRet0 = $_0$1, $_0$0) | 0;
        } else {
          $78 = _llvm_cttz_i32($d_sroa_0_0_extract_trunc | 0) | 0;
          $_0$1 = 0 | $n_sroa_1_4_extract_trunc >>> ($78 >>> 0);
          $_0$0 = $n_sroa_1_4_extract_trunc << 32 - $78 | $n_sroa_0_0_extract_trunc >>> ($78 >>> 0) | 0;
          return (tempRet0 = $_0$1, $_0$0) | 0;
        }
      }
    } while (0);
    if (($sr_1_ph | 0) == 0) {
      $q_sroa_1_1_lcssa = $q_sroa_1_1_ph;
      $q_sroa_0_1_lcssa = $q_sroa_0_1_ph;
      $r_sroa_1_1_lcssa = $r_sroa_1_1_ph;
      $r_sroa_0_1_lcssa = $r_sroa_0_1_ph;
      $carry_0_lcssa$1 = 0;
      $carry_0_lcssa$0 = 0;
    } else {
      $d_sroa_0_0_insert_insert99$0 = 0 | $b$0 & -1;
      $d_sroa_0_0_insert_insert99$1 = $d_sroa_1_4_extract_shift$0 | $b$1 & 0;
      $137$0 = _i64Add($d_sroa_0_0_insert_insert99$0 | 0, $d_sroa_0_0_insert_insert99$1 | 0, -1, -1) | 0;
      $137$1 = tempRet0;
      $q_sroa_1_1198 = $q_sroa_1_1_ph;
      $q_sroa_0_1199 = $q_sroa_0_1_ph;
      $r_sroa_1_1200 = $r_sroa_1_1_ph;
      $r_sroa_0_1201 = $r_sroa_0_1_ph;
      $sr_1202 = $sr_1_ph;
      $carry_0203 = 0;
      while (1) {
        $147 = $q_sroa_0_1199 >>> 31 | $q_sroa_1_1198 << 1;
        $149 = $carry_0203 | $q_sroa_0_1199 << 1;
        $r_sroa_0_0_insert_insert42$0 = 0 | ($r_sroa_0_1201 << 1 | $q_sroa_1_1198 >>> 31);
        $r_sroa_0_0_insert_insert42$1 = $r_sroa_0_1201 >>> 31 | $r_sroa_1_1200 << 1 | 0;
        _i64Subtract($137$0 | 0, $137$1 | 0, $r_sroa_0_0_insert_insert42$0 | 0, $r_sroa_0_0_insert_insert42$1 | 0) | 0;
        $150$1 = tempRet0;
        $151$0 = $150$1 >> 31 | (($150$1 | 0) < 0 ? -1 : 0) << 1;
        $152 = $151$0 & 1;
        $154$0 = _i64Subtract($r_sroa_0_0_insert_insert42$0 | 0, $r_sroa_0_0_insert_insert42$1 | 0, $151$0 & $d_sroa_0_0_insert_insert99$0 | 0, ((($150$1 | 0) < 0 ? -1 : 0) >> 31 | (($150$1 | 0) < 0 ? -1 : 0) << 1) & $d_sroa_0_0_insert_insert99$1 | 0) | 0;
        $r_sroa_0_0_extract_trunc = $154$0;
        $r_sroa_1_4_extract_trunc = tempRet0;
        $155 = $sr_1202 - 1 | 0;
        if (($155 | 0) == 0) {
          break;
        } else {
          $q_sroa_1_1198 = $147;
          $q_sroa_0_1199 = $149;
          $r_sroa_1_1200 = $r_sroa_1_4_extract_trunc;
          $r_sroa_0_1201 = $r_sroa_0_0_extract_trunc;
          $sr_1202 = $155;
          $carry_0203 = $152;
        }
      }
      $q_sroa_1_1_lcssa = $147;
      $q_sroa_0_1_lcssa = $149;
      $r_sroa_1_1_lcssa = $r_sroa_1_4_extract_trunc;
      $r_sroa_0_1_lcssa = $r_sroa_0_0_extract_trunc;
      $carry_0_lcssa$1 = 0;
      $carry_0_lcssa$0 = $152;
    }
    $q_sroa_0_0_insert_ext75$0 = $q_sroa_0_1_lcssa;
    $q_sroa_0_0_insert_ext75$1 = 0;
    $q_sroa_0_0_insert_insert77$1 = $q_sroa_1_1_lcssa | $q_sroa_0_0_insert_ext75$1;
    if (($rem | 0) != 0) {
      HEAP32[$rem >> 2] = 0 | $r_sroa_0_1_lcssa;
      HEAP32[$rem + 4 >> 2] = $r_sroa_1_1_lcssa | 0;
    }
    $_0$1 = (0 | $q_sroa_0_0_insert_ext75$0) >>> 31 | $q_sroa_0_0_insert_insert77$1 << 1 | ($q_sroa_0_0_insert_ext75$1 << 1 | $q_sroa_0_0_insert_ext75$0 >>> 31) & 0 | $carry_0_lcssa$1;
    $_0$0 = ($q_sroa_0_0_insert_ext75$0 << 1 | 0 >>> 31) & -2 | $carry_0_lcssa$0;
    return (tempRet0 = $_0$1, $_0$0) | 0;
}
function ___udivdi3($a$0, $a$1, $b$0, $b$1) {
    $a$0 = $a$0 | 0;
    $a$1 = $a$1 | 0;
    $b$0 = $b$0 | 0;
    $b$1 = $b$1 | 0;
    var $1$0 = 0;
    $1$0 = ___udivmoddi4($a$0, $a$1, $b$0, $b$1, 0) | 0;
    return $1$0 | 0;
}
function ___uremdi3($a$0, $a$1, $b$0, $b$1) {
    $a$0 = $a$0 | 0;
    $a$1 = $a$1 | 0;
    $b$0 = $b$0 | 0;
    $b$1 = $b$1 | 0;
    var $rem = 0, __stackBase__ = 0;
    __stackBase__ = STACKTOP;
    STACKTOP = STACKTOP + 16 | 0;
    $rem = __stackBase__ | 0;
    ___udivmoddi4($a$0, $a$1, $b$0, $b$1, $rem) | 0;
    STACKTOP = __stackBase__;
    return (tempRet0 = HEAP32[$rem + 4 >> 2] | 0, HEAP32[$rem >> 2] | 0) | 0;
}
function _bitshift64Lshr(low, high, bits) {
    low = low|0; high = high|0; bits = bits|0;
    var ander = 0;
    if ((bits|0) < 32) {
      ander = ((1 << bits) - 1)|0;
      tempRet0 = high >>> bits;
      return (low >>> bits) | ((high&ander) << (32 - bits));
    }
    tempRet0 = 0;
    return (high >>> (bits - 32))|0;
}
function _bitshift64Shl(low, high, bits) {
    low = low|0; high = high|0; bits = bits|0;
    var ander = 0;
    if ((bits|0) < 32) {
      ander = ((1 << bits) - 1)|0;
      tempRet0 = (high << bits) | ((low&(ander << (32 - bits))) >>> (32 - bits));
      return low << bits;
    }
    tempRet0 = low << (bits - 32);
    return 0;
}
function _llvm_bswap_i32(x) {
    x = x|0;
    return (((x&0xff)<<24) | (((x>>8)&0xff)<<16) | (((x>>16)&0xff)<<8) | (x>>>24))|0;
}
function _memcpy(dest, src, num) {
    dest = dest|0; src = src|0; num = num|0;
    var ret = 0;
    var aligned_dest_end = 0;
    var block_aligned_dest_end = 0;
    var dest_end = 0;
    // Test against a benchmarked cutoff limit for when HEAPU8.set() becomes faster to use.
    if ((num|0) >=
      8192
    ) {
      return _emscripten_memcpy_big(dest|0, src|0, num|0)|0;
    }

    ret = dest|0;
    dest_end = (dest + num)|0;
    if ((dest&3) == (src&3)) {
      // The initial unaligned < 4-byte front.
      while (dest & 3) {
        if ((num|0) == 0) return ret|0;
        HEAP8[((dest)>>0)]=((HEAP8[((src)>>0)])|0);
        dest = (dest+1)|0;
        src = (src+1)|0;
        num = (num-1)|0;
      }
      aligned_dest_end = (dest_end & -4)|0;
      block_aligned_dest_end = (aligned_dest_end - 64)|0;
      while ((dest|0) <= (block_aligned_dest_end|0) ) {
        HEAP32[((dest)>>2)]=((HEAP32[((src)>>2)])|0);
        HEAP32[(((dest)+(4))>>2)]=((HEAP32[(((src)+(4))>>2)])|0);
        HEAP32[(((dest)+(8))>>2)]=((HEAP32[(((src)+(8))>>2)])|0);
        HEAP32[(((dest)+(12))>>2)]=((HEAP32[(((src)+(12))>>2)])|0);
        HEAP32[(((dest)+(16))>>2)]=((HEAP32[(((src)+(16))>>2)])|0);
        HEAP32[(((dest)+(20))>>2)]=((HEAP32[(((src)+(20))>>2)])|0);
        HEAP32[(((dest)+(24))>>2)]=((HEAP32[(((src)+(24))>>2)])|0);
        HEAP32[(((dest)+(28))>>2)]=((HEAP32[(((src)+(28))>>2)])|0);
        HEAP32[(((dest)+(32))>>2)]=((HEAP32[(((src)+(32))>>2)])|0);
        HEAP32[(((dest)+(36))>>2)]=((HEAP32[(((src)+(36))>>2)])|0);
        HEAP32[(((dest)+(40))>>2)]=((HEAP32[(((src)+(40))>>2)])|0);
        HEAP32[(((dest)+(44))>>2)]=((HEAP32[(((src)+(44))>>2)])|0);
        HEAP32[(((dest)+(48))>>2)]=((HEAP32[(((src)+(48))>>2)])|0);
        HEAP32[(((dest)+(52))>>2)]=((HEAP32[(((src)+(52))>>2)])|0);
        HEAP32[(((dest)+(56))>>2)]=((HEAP32[(((src)+(56))>>2)])|0);
        HEAP32[(((dest)+(60))>>2)]=((HEAP32[(((src)+(60))>>2)])|0);
        dest = (dest+64)|0;
        src = (src+64)|0;
      }
      while ((dest|0) < (aligned_dest_end|0) ) {
        HEAP32[((dest)>>2)]=((HEAP32[((src)>>2)])|0);
        dest = (dest+4)|0;
        src = (src+4)|0;
      }
    } else {
      // In the unaligned copy case, unroll a bit as well.
      aligned_dest_end = (dest_end - 4)|0;
      while ((dest|0) < (aligned_dest_end|0) ) {
        HEAP8[((dest)>>0)]=((HEAP8[((src)>>0)])|0);
        HEAP8[(((dest)+(1))>>0)]=((HEAP8[(((src)+(1))>>0)])|0);
        HEAP8[(((dest)+(2))>>0)]=((HEAP8[(((src)+(2))>>0)])|0);
        HEAP8[(((dest)+(3))>>0)]=((HEAP8[(((src)+(3))>>0)])|0);
        dest = (dest+4)|0;
        src = (src+4)|0;
      }
    }
    // The remaining unaligned < 4 byte tail.
    while ((dest|0) < (dest_end|0)) {
      HEAP8[((dest)>>0)]=((HEAP8[((src)>>0)])|0);
      dest = (dest+1)|0;
      src = (src+1)|0;
    }
    return ret|0;
}
function _memmove(dest, src, num) {
    dest = dest|0; src = src|0; num = num|0;
    var ret = 0;
    if (((src|0) < (dest|0)) & ((dest|0) < ((src + num)|0))) {
      // Unlikely case: Copy backwards in a safe manner
      ret = dest;
      src = (src + num)|0;
      dest = (dest + num)|0;
      while ((num|0) > 0) {
        dest = (dest - 1)|0;
        src = (src - 1)|0;
        num = (num - 1)|0;
        HEAP8[((dest)>>0)]=((HEAP8[((src)>>0)])|0);
      }
      dest = ret;
    } else {
      _memcpy(dest, src, num) | 0;
    }
    return dest | 0;
}
function _memset(ptr, value, num) {
    ptr = ptr|0; value = value|0; num = num|0;
    var end = 0, aligned_end = 0, block_aligned_end = 0, value4 = 0;
    end = (ptr + num)|0;

    value = value & 0xff;
    if ((num|0) >= 67 /* 64 bytes for an unrolled loop + 3 bytes for unaligned head*/) {
      while ((ptr&3) != 0) {
        HEAP8[((ptr)>>0)]=value;
        ptr = (ptr+1)|0;
      }

      aligned_end = (end & -4)|0;
      block_aligned_end = (aligned_end - 64)|0;
      value4 = value | (value << 8) | (value << 16) | (value << 24);

      while((ptr|0) <= (block_aligned_end|0)) {
        HEAP32[((ptr)>>2)]=value4;
        HEAP32[(((ptr)+(4))>>2)]=value4;
        HEAP32[(((ptr)+(8))>>2)]=value4;
        HEAP32[(((ptr)+(12))>>2)]=value4;
        HEAP32[(((ptr)+(16))>>2)]=value4;
        HEAP32[(((ptr)+(20))>>2)]=value4;
        HEAP32[(((ptr)+(24))>>2)]=value4;
        HEAP32[(((ptr)+(28))>>2)]=value4;
        HEAP32[(((ptr)+(32))>>2)]=value4;
        HEAP32[(((ptr)+(36))>>2)]=value4;
        HEAP32[(((ptr)+(40))>>2)]=value4;
        HEAP32[(((ptr)+(44))>>2)]=value4;
        HEAP32[(((ptr)+(48))>>2)]=value4;
        HEAP32[(((ptr)+(52))>>2)]=value4;
        HEAP32[(((ptr)+(56))>>2)]=value4;
        HEAP32[(((ptr)+(60))>>2)]=value4;
        ptr = (ptr + 64)|0;
      }

      while ((ptr|0) < (aligned_end|0) ) {
        HEAP32[((ptr)>>2)]=value4;
        ptr = (ptr+4)|0;
      }
    }
    // The remaining bytes.
    while ((ptr|0) < (end|0)) {
      HEAP8[((ptr)>>0)]=value;
      ptr = (ptr+1)|0;
    }
    return (end-num)|0;
}
function _sbrk(increment) {
    increment = increment|0;
    var oldDynamicTop = 0;
    var oldDynamicTopOnChange = 0;
    var newDynamicTop = 0;
    var totalMemory = 0;
    oldDynamicTop = HEAP32[DYNAMICTOP_PTR>>2]|0;
    newDynamicTop = oldDynamicTop + increment | 0;

    if (((increment|0) > 0 & (newDynamicTop|0) < (oldDynamicTop|0)) // Detect and fail if we would wrap around signed 32-bit int.
      | (newDynamicTop|0) < 0) { // Also underflow, sbrk() should be able to be used to subtract.
      abortOnCannotGrowMemory()|0;
      ___setErrNo(12);
      return -1;
    }

    HEAP32[DYNAMICTOP_PTR>>2] = newDynamicTop;
    totalMemory = getTotalMemory()|0;
    if ((newDynamicTop|0) > (totalMemory|0)) {
      if ((enlargeMemory()|0) == 0) {
        HEAP32[DYNAMICTOP_PTR>>2] = oldDynamicTop;
        ___setErrNo(12);
        return -1;
      }
    }
    return oldDynamicTop|0;
}

  
function dynCall_ii(index,a1) {
  index = index|0;
  a1=a1|0;
  return FUNCTION_TABLE_ii[index&7](a1|0)|0;
}


function dynCall_iiii(index,a1,a2,a3) {
  index = index|0;
  a1=a1|0; a2=a2|0; a3=a3|0;
  return FUNCTION_TABLE_iiii[index&7](a1|0,a2|0,a3|0)|0;
}


function dynCall_vii(index,a1,a2) {
  index = index|0;
  a1=a1|0; a2=a2|0;
  FUNCTION_TABLE_vii[index&31](a1|0,a2|0);
}

function b0(p0) {
 p0 = p0|0; nullFunc_ii(0);return 0;
}
function b1(p0,p1,p2) {
 p0 = p0|0;p1 = p1|0;p2 = p2|0; nullFunc_iiii(1);return 0;
}
function b2(p0,p1) {
 p0 = p0|0;p1 = p1|0; nullFunc_vii(2);
}

// EMSCRIPTEN_END_FUNCS
var FUNCTION_TABLE_ii = [b0,___stdio_close,b0,b0,b0,b0,b0,_fus_printer_flush_file];
var FUNCTION_TABLE_iiii = [b1,b1,___stdout_write,___stdio_seek,___stdio_write,b1,b1,b1];
var FUNCTION_TABLE_vii = [b2,b2,b2,b2,b2,_fus_class_instance_init_zero,_fus_class_instance_cleanup_zero,b2,_fus_class_cleanup_runner_callframe,_fus_class_init_symtable_entry,_fus_class_cleanup_symtable_entry,_fus_vm_error_callback_default,_fus_class_init_array,_fus_class_cleanup_array,_fus_class_init_value,_fus_class_cleanup_value,_fus_class_init_arr,_fus_class_cleanup_arr,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2
,b2,b2,b2];

  return { ___errno_location: ___errno_location, ___udivdi3: ___udivdi3, ___uremdi3: ___uremdi3, _bitshift64Lshr: _bitshift64Lshr, _bitshift64Shl: _bitshift64Shl, _fflush: _fflush, _free: _free, _i64Add: _i64Add, _i64Subtract: _i64Subtract, _llvm_bswap_i32: _llvm_bswap_i32, _main: _main, _malloc: _malloc, _memcpy: _memcpy, _memmove: _memmove, _memset: _memset, _realloc: _realloc, _sbrk: _sbrk, dynCall_ii: dynCall_ii, dynCall_iiii: dynCall_iiii, dynCall_vii: dynCall_vii, establishStackSpace: establishStackSpace, getTempRet0: getTempRet0, runPostSets: runPostSets, setTempRet0: setTempRet0, setThrew: setThrew, stackAlloc: stackAlloc, stackRestore: stackRestore, stackSave: stackSave };
})
// EMSCRIPTEN_END_ASM
(Module.asmGlobalArg, Module.asmLibraryArg, buffer);

var real____errno_location = asm["___errno_location"]; asm["___errno_location"] = function() {
  assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
  assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
  return real____errno_location.apply(null, arguments);
};

var real____udivdi3 = asm["___udivdi3"]; asm["___udivdi3"] = function() {
  assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
  assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
  return real____udivdi3.apply(null, arguments);
};

var real____uremdi3 = asm["___uremdi3"]; asm["___uremdi3"] = function() {
  assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
  assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
  return real____uremdi3.apply(null, arguments);
};

var real__bitshift64Lshr = asm["_bitshift64Lshr"]; asm["_bitshift64Lshr"] = function() {
  assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
  assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
  return real__bitshift64Lshr.apply(null, arguments);
};

var real__bitshift64Shl = asm["_bitshift64Shl"]; asm["_bitshift64Shl"] = function() {
  assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
  assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
  return real__bitshift64Shl.apply(null, arguments);
};

var real__fflush = asm["_fflush"]; asm["_fflush"] = function() {
  assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
  assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
  return real__fflush.apply(null, arguments);
};

var real__free = asm["_free"]; asm["_free"] = function() {
  assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
  assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
  return real__free.apply(null, arguments);
};

var real__i64Add = asm["_i64Add"]; asm["_i64Add"] = function() {
  assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
  assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
  return real__i64Add.apply(null, arguments);
};

var real__i64Subtract = asm["_i64Subtract"]; asm["_i64Subtract"] = function() {
  assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
  assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
  return real__i64Subtract.apply(null, arguments);
};

var real__llvm_bswap_i32 = asm["_llvm_bswap_i32"]; asm["_llvm_bswap_i32"] = function() {
  assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
  assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
  return real__llvm_bswap_i32.apply(null, arguments);
};

var real__main = asm["_main"]; asm["_main"] = function() {
  assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
  assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
  return real__main.apply(null, arguments);
};

var real__malloc = asm["_malloc"]; asm["_malloc"] = function() {
  assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
  assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
  return real__malloc.apply(null, arguments);
};

var real__memmove = asm["_memmove"]; asm["_memmove"] = function() {
  assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
  assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
  return real__memmove.apply(null, arguments);
};

var real__realloc = asm["_realloc"]; asm["_realloc"] = function() {
  assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
  assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
  return real__realloc.apply(null, arguments);
};

var real__sbrk = asm["_sbrk"]; asm["_sbrk"] = function() {
  assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
  assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
  return real__sbrk.apply(null, arguments);
};

var real_establishStackSpace = asm["establishStackSpace"]; asm["establishStackSpace"] = function() {
  assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
  assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
  return real_establishStackSpace.apply(null, arguments);
};

var real_getTempRet0 = asm["getTempRet0"]; asm["getTempRet0"] = function() {
  assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
  assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
  return real_getTempRet0.apply(null, arguments);
};

var real_setTempRet0 = asm["setTempRet0"]; asm["setTempRet0"] = function() {
  assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
  assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
  return real_setTempRet0.apply(null, arguments);
};

var real_setThrew = asm["setThrew"]; asm["setThrew"] = function() {
  assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
  assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
  return real_setThrew.apply(null, arguments);
};

var real_stackAlloc = asm["stackAlloc"]; asm["stackAlloc"] = function() {
  assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
  assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
  return real_stackAlloc.apply(null, arguments);
};

var real_stackRestore = asm["stackRestore"]; asm["stackRestore"] = function() {
  assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
  assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
  return real_stackRestore.apply(null, arguments);
};

var real_stackSave = asm["stackSave"]; asm["stackSave"] = function() {
  assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
  assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
  return real_stackSave.apply(null, arguments);
};
var ___errno_location = Module["___errno_location"] = asm["___errno_location"];
var ___udivdi3 = Module["___udivdi3"] = asm["___udivdi3"];
var ___uremdi3 = Module["___uremdi3"] = asm["___uremdi3"];
var _bitshift64Lshr = Module["_bitshift64Lshr"] = asm["_bitshift64Lshr"];
var _bitshift64Shl = Module["_bitshift64Shl"] = asm["_bitshift64Shl"];
var _fflush = Module["_fflush"] = asm["_fflush"];
var _free = Module["_free"] = asm["_free"];
var _i64Add = Module["_i64Add"] = asm["_i64Add"];
var _i64Subtract = Module["_i64Subtract"] = asm["_i64Subtract"];
var _llvm_bswap_i32 = Module["_llvm_bswap_i32"] = asm["_llvm_bswap_i32"];
var _main = Module["_main"] = asm["_main"];
var _malloc = Module["_malloc"] = asm["_malloc"];
var _memcpy = Module["_memcpy"] = asm["_memcpy"];
var _memmove = Module["_memmove"] = asm["_memmove"];
var _memset = Module["_memset"] = asm["_memset"];
var _realloc = Module["_realloc"] = asm["_realloc"];
var _sbrk = Module["_sbrk"] = asm["_sbrk"];
var establishStackSpace = Module["establishStackSpace"] = asm["establishStackSpace"];
var getTempRet0 = Module["getTempRet0"] = asm["getTempRet0"];
var runPostSets = Module["runPostSets"] = asm["runPostSets"];
var setTempRet0 = Module["setTempRet0"] = asm["setTempRet0"];
var setThrew = Module["setThrew"] = asm["setThrew"];
var stackAlloc = Module["stackAlloc"] = asm["stackAlloc"];
var stackRestore = Module["stackRestore"] = asm["stackRestore"];
var stackSave = Module["stackSave"] = asm["stackSave"];
var dynCall_ii = Module["dynCall_ii"] = asm["dynCall_ii"];
var dynCall_iiii = Module["dynCall_iiii"] = asm["dynCall_iiii"];
var dynCall_vii = Module["dynCall_vii"] = asm["dynCall_vii"];
;



// === Auto-generated postamble setup entry stuff ===

Module['asm'] = asm;

if (!Module["intArrayFromString"]) Module["intArrayFromString"] = function() { abort("'intArrayFromString' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Module["intArrayToString"]) Module["intArrayToString"] = function() { abort("'intArrayToString' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
Module["ccall"] = ccall;
Module["cwrap"] = cwrap;
if (!Module["setValue"]) Module["setValue"] = function() { abort("'setValue' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Module["getValue"]) Module["getValue"] = function() { abort("'getValue' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Module["allocate"]) Module["allocate"] = function() { abort("'allocate' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Module["getMemory"]) Module["getMemory"] = function() { abort("'getMemory' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ). Alternatively, forcing filesystem support (-s FORCE_FILESYSTEM=1) can export this for you") };
if (!Module["Pointer_stringify"]) Module["Pointer_stringify"] = function() { abort("'Pointer_stringify' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Module["AsciiToString"]) Module["AsciiToString"] = function() { abort("'AsciiToString' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Module["stringToAscii"]) Module["stringToAscii"] = function() { abort("'stringToAscii' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Module["UTF8ArrayToString"]) Module["UTF8ArrayToString"] = function() { abort("'UTF8ArrayToString' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Module["UTF8ToString"]) Module["UTF8ToString"] = function() { abort("'UTF8ToString' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Module["stringToUTF8Array"]) Module["stringToUTF8Array"] = function() { abort("'stringToUTF8Array' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Module["stringToUTF8"]) Module["stringToUTF8"] = function() { abort("'stringToUTF8' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Module["lengthBytesUTF8"]) Module["lengthBytesUTF8"] = function() { abort("'lengthBytesUTF8' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Module["UTF16ToString"]) Module["UTF16ToString"] = function() { abort("'UTF16ToString' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Module["stringToUTF16"]) Module["stringToUTF16"] = function() { abort("'stringToUTF16' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Module["lengthBytesUTF16"]) Module["lengthBytesUTF16"] = function() { abort("'lengthBytesUTF16' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Module["UTF32ToString"]) Module["UTF32ToString"] = function() { abort("'UTF32ToString' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Module["stringToUTF32"]) Module["stringToUTF32"] = function() { abort("'stringToUTF32' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Module["lengthBytesUTF32"]) Module["lengthBytesUTF32"] = function() { abort("'lengthBytesUTF32' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Module["allocateUTF8"]) Module["allocateUTF8"] = function() { abort("'allocateUTF8' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Module["stackTrace"]) Module["stackTrace"] = function() { abort("'stackTrace' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Module["addOnPreRun"]) Module["addOnPreRun"] = function() { abort("'addOnPreRun' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Module["addOnInit"]) Module["addOnInit"] = function() { abort("'addOnInit' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Module["addOnPreMain"]) Module["addOnPreMain"] = function() { abort("'addOnPreMain' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Module["addOnExit"]) Module["addOnExit"] = function() { abort("'addOnExit' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Module["addOnPostRun"]) Module["addOnPostRun"] = function() { abort("'addOnPostRun' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Module["writeStringToMemory"]) Module["writeStringToMemory"] = function() { abort("'writeStringToMemory' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Module["writeArrayToMemory"]) Module["writeArrayToMemory"] = function() { abort("'writeArrayToMemory' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Module["writeAsciiToMemory"]) Module["writeAsciiToMemory"] = function() { abort("'writeAsciiToMemory' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Module["addRunDependency"]) Module["addRunDependency"] = function() { abort("'addRunDependency' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ). Alternatively, forcing filesystem support (-s FORCE_FILESYSTEM=1) can export this for you") };
if (!Module["removeRunDependency"]) Module["removeRunDependency"] = function() { abort("'removeRunDependency' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ). Alternatively, forcing filesystem support (-s FORCE_FILESYSTEM=1) can export this for you") };
if (!Module["FS"]) Module["FS"] = function() { abort("'FS' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Module["FS_createFolder"]) Module["FS_createFolder"] = function() { abort("'FS_createFolder' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ). Alternatively, forcing filesystem support (-s FORCE_FILESYSTEM=1) can export this for you") };
if (!Module["FS_createPath"]) Module["FS_createPath"] = function() { abort("'FS_createPath' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ). Alternatively, forcing filesystem support (-s FORCE_FILESYSTEM=1) can export this for you") };
if (!Module["FS_createDataFile"]) Module["FS_createDataFile"] = function() { abort("'FS_createDataFile' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ). Alternatively, forcing filesystem support (-s FORCE_FILESYSTEM=1) can export this for you") };
if (!Module["FS_createPreloadedFile"]) Module["FS_createPreloadedFile"] = function() { abort("'FS_createPreloadedFile' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ). Alternatively, forcing filesystem support (-s FORCE_FILESYSTEM=1) can export this for you") };
if (!Module["FS_createLazyFile"]) Module["FS_createLazyFile"] = function() { abort("'FS_createLazyFile' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ). Alternatively, forcing filesystem support (-s FORCE_FILESYSTEM=1) can export this for you") };
if (!Module["FS_createLink"]) Module["FS_createLink"] = function() { abort("'FS_createLink' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ). Alternatively, forcing filesystem support (-s FORCE_FILESYSTEM=1) can export this for you") };
if (!Module["FS_createDevice"]) Module["FS_createDevice"] = function() { abort("'FS_createDevice' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ). Alternatively, forcing filesystem support (-s FORCE_FILESYSTEM=1) can export this for you") };
if (!Module["FS_unlink"]) Module["FS_unlink"] = function() { abort("'FS_unlink' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ). Alternatively, forcing filesystem support (-s FORCE_FILESYSTEM=1) can export this for you") };
if (!Module["GL"]) Module["GL"] = function() { abort("'GL' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Module["staticAlloc"]) Module["staticAlloc"] = function() { abort("'staticAlloc' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Module["dynamicAlloc"]) Module["dynamicAlloc"] = function() { abort("'dynamicAlloc' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Module["warnOnce"]) Module["warnOnce"] = function() { abort("'warnOnce' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Module["loadDynamicLibrary"]) Module["loadDynamicLibrary"] = function() { abort("'loadDynamicLibrary' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Module["loadWebAssemblyModule"]) Module["loadWebAssemblyModule"] = function() { abort("'loadWebAssemblyModule' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Module["getLEB"]) Module["getLEB"] = function() { abort("'getLEB' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Module["getFunctionTables"]) Module["getFunctionTables"] = function() { abort("'getFunctionTables' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Module["alignFunctionTables"]) Module["alignFunctionTables"] = function() { abort("'alignFunctionTables' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Module["registerFunctions"]) Module["registerFunctions"] = function() { abort("'registerFunctions' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Module["addFunction"]) Module["addFunction"] = function() { abort("'addFunction' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Module["removeFunction"]) Module["removeFunction"] = function() { abort("'removeFunction' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Module["getFuncWrapper"]) Module["getFuncWrapper"] = function() { abort("'getFuncWrapper' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Module["prettyPrint"]) Module["prettyPrint"] = function() { abort("'prettyPrint' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Module["makeBigInt"]) Module["makeBigInt"] = function() { abort("'makeBigInt' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Module["dynCall"]) Module["dynCall"] = function() { abort("'dynCall' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Module["getCompilerSetting"]) Module["getCompilerSetting"] = function() { abort("'getCompilerSetting' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Module["intArrayFromBase64"]) Module["intArrayFromBase64"] = function() { abort("'intArrayFromBase64' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Module["tryParseAsDataURI"]) Module["tryParseAsDataURI"] = function() { abort("'tryParseAsDataURI' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };if (!Module["ALLOC_NORMAL"]) Object.defineProperty(Module, "ALLOC_NORMAL", { get: function() { abort("'ALLOC_NORMAL' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") } });
if (!Module["ALLOC_STACK"]) Object.defineProperty(Module, "ALLOC_STACK", { get: function() { abort("'ALLOC_STACK' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") } });
if (!Module["ALLOC_STATIC"]) Object.defineProperty(Module, "ALLOC_STATIC", { get: function() { abort("'ALLOC_STATIC' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") } });
if (!Module["ALLOC_DYNAMIC"]) Object.defineProperty(Module, "ALLOC_DYNAMIC", { get: function() { abort("'ALLOC_DYNAMIC' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") } });
if (!Module["ALLOC_NONE"]) Object.defineProperty(Module, "ALLOC_NONE", { get: function() { abort("'ALLOC_NONE' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") } });

if (memoryInitializer) {
  if (!isDataURI(memoryInitializer)) {
    if (typeof Module['locateFile'] === 'function') {
      memoryInitializer = Module['locateFile'](memoryInitializer);
    } else if (Module['memoryInitializerPrefixURL']) {
      memoryInitializer = Module['memoryInitializerPrefixURL'] + memoryInitializer;
    }
  }
  if (ENVIRONMENT_IS_NODE || ENVIRONMENT_IS_SHELL) {
    var data = Module['readBinary'](memoryInitializer);
    HEAPU8.set(data, GLOBAL_BASE);
  } else {
    addRunDependency('memory initializer');
    var applyMemoryInitializer = function(data) {
      if (data.byteLength) data = new Uint8Array(data);
      for (var i = 0; i < data.length; i++) {
        assert(HEAPU8[GLOBAL_BASE + i] === 0, "area for memory initializer should not have been touched before it's loaded");
      }
      HEAPU8.set(data, GLOBAL_BASE);
      // Delete the typed array that contains the large blob of the memory initializer request response so that
      // we won't keep unnecessary memory lying around. However, keep the XHR object itself alive so that e.g.
      // its .status field can still be accessed later.
      if (Module['memoryInitializerRequest']) delete Module['memoryInitializerRequest'].response;
      removeRunDependency('memory initializer');
    }
    function doBrowserLoad() {
      Module['readAsync'](memoryInitializer, applyMemoryInitializer, function() {
        throw 'could not load memory initializer ' + memoryInitializer;
      });
    }
    var memoryInitializerBytes = tryParseAsDataURI(memoryInitializer);
    if (memoryInitializerBytes) {
      applyMemoryInitializer(memoryInitializerBytes.buffer);
    } else
    if (Module['memoryInitializerRequest']) {
      // a network request has already been created, just use that
      function useRequest() {
        var request = Module['memoryInitializerRequest'];
        var response = request.response;
        if (request.status !== 200 && request.status !== 0) {
          var data = tryParseAsDataURI(Module['memoryInitializerRequestURL']);
          if (data) {
            response = data.buffer;
          } else {
            // If you see this warning, the issue may be that you are using locateFile or memoryInitializerPrefixURL, and defining them in JS. That
            // means that the HTML file doesn't know about them, and when it tries to create the mem init request early, does it to the wrong place.
            // Look in your browser's devtools network console to see what's going on.
            console.warn('a problem seems to have happened with Module.memoryInitializerRequest, status: ' + request.status + ', retrying ' + memoryInitializer);
            doBrowserLoad();
            return;
          }
        }
        applyMemoryInitializer(response);
      }
      if (Module['memoryInitializerRequest'].response) {
        setTimeout(useRequest, 0); // it's already here; but, apply it asynchronously
      } else {
        Module['memoryInitializerRequest'].addEventListener('load', useRequest); // wait for it
      }
    } else {
      // fetch it from the network ourselves
      doBrowserLoad();
    }
  }
}



/**
 * @constructor
 * @extends {Error}
 * @this {ExitStatus}
 */
function ExitStatus(status) {
  this.name = "ExitStatus";
  this.message = "Program terminated with exit(" + status + ")";
  this.status = status;
};
ExitStatus.prototype = new Error();
ExitStatus.prototype.constructor = ExitStatus;

var initialStackTop;
var calledMain = false;

dependenciesFulfilled = function runCaller() {
  // If run has never been called, and we should call run (INVOKE_RUN is true, and Module.noInitialRun is not false)
  if (!Module['calledRun']) run();
  if (!Module['calledRun']) dependenciesFulfilled = runCaller; // try this again later, after new deps are fulfilled
}

Module['callMain'] = function callMain(args) {
  assert(runDependencies == 0, 'cannot call main when async dependencies remain! (listen on __ATMAIN__)');
  assert(__ATPRERUN__.length == 0, 'cannot call main when preRun functions remain to be called');

  args = args || [];

  ensureInitRuntime();

  var argc = args.length+1;
  var argv = stackAlloc((argc + 1) * 4);
  HEAP32[argv >> 2] = allocateUTF8OnStack(Module['thisProgram']);
  for (var i = 1; i < argc; i++) {
    HEAP32[(argv >> 2) + i] = allocateUTF8OnStack(args[i - 1]);
  }
  HEAP32[(argv >> 2) + argc] = 0;


  try {

    var ret = Module['_main'](argc, argv, 0);


    // if we're not running an evented main loop, it's time to exit
      exit(ret, /* implicit = */ true);
  }
  catch(e) {
    if (e instanceof ExitStatus) {
      // exit() throws this once it's done to make sure execution
      // has been stopped completely
      return;
    } else if (e == 'SimulateInfiniteLoop') {
      // running an evented main loop, don't immediately exit
      Module['noExitRuntime'] = true;
      return;
    } else {
      var toLog = e;
      if (e && typeof e === 'object' && e.stack) {
        toLog = [e, e.stack];
      }
      Module.printErr('exception thrown: ' + toLog);
      Module['quit'](1, e);
    }
  } finally {
    calledMain = true;
  }
}




/** @type {function(Array=)} */
function run(args) {
  args = args || Module['arguments'];

  if (runDependencies > 0) {
    return;
  }

  writeStackCookie();

  preRun();

  if (runDependencies > 0) return; // a preRun added a dependency, run will be called later
  if (Module['calledRun']) return; // run may have just been called through dependencies being fulfilled just in this very frame

  function doRun() {
    if (Module['calledRun']) return; // run may have just been called while the async setStatus time below was happening
    Module['calledRun'] = true;

    if (ABORT) return;

    ensureInitRuntime();

    preMain();

    if (Module['onRuntimeInitialized']) Module['onRuntimeInitialized']();

    if (Module['_main'] && shouldRunNow) Module['callMain'](args);

    postRun();
  }

  if (Module['setStatus']) {
    Module['setStatus']('Running...');
    setTimeout(function() {
      setTimeout(function() {
        Module['setStatus']('');
      }, 1);
      doRun();
    }, 1);
  } else {
    doRun();
  }
  checkStackCookie();
}
Module['run'] = run;

function checkUnflushedContent() {
  // Compiler settings do not allow exiting the runtime, so flushing
  // the streams is not possible. but in ASSERTIONS mode we check
  // if there was something to flush, and if so tell the user they
  // should request that the runtime be exitable.
  // Normally we would not even include flush() at all, but in ASSERTIONS
  // builds we do so just for this check, and here we see if there is any
  // content to flush, that is, we check if there would have been
  // something a non-ASSERTIONS build would have not seen.
  // How we flush the streams depends on whether we are in NO_FILESYSTEM
  // mode (which has its own special function for this; otherwise, all
  // the code is inside libc)
  var print = Module['print'];
  var printErr = Module['printErr'];
  var has = false;
  Module['print'] = Module['printErr'] = function(x) {
    has = true;
  }
  try { // it doesn't matter if it fails
    var flush = flush_NO_FILESYSTEM;
    if (flush) flush(0);
  } catch(e) {}
  Module['print'] = print;
  Module['printErr'] = printErr;
  if (has) {
    warnOnce('stdio streams had content in them that was not flushed. you should set NO_EXIT_RUNTIME to 0 (see the FAQ), or make sure to emit a newline when you printf etc.');
  }
}

function exit(status, implicit) {
  checkUnflushedContent();

  // if this is just main exit-ing implicitly, and the status is 0, then we
  // don't need to do anything here and can just leave. if the status is
  // non-zero, though, then we need to report it.
  // (we may have warned about this earlier, if a situation justifies doing so)
  if (implicit && Module['noExitRuntime'] && status === 0) {
    return;
  }

  if (Module['noExitRuntime']) {
    // if exit() was called, we may warn the user if the runtime isn't actually being shut down
    if (!implicit) {
      Module.printErr('exit(' + status + ') called, but NO_EXIT_RUNTIME is set, so halting execution but not exiting the runtime or preventing further async execution (build with NO_EXIT_RUNTIME=0, if you want a true shutdown)');
    }
  } else {

    ABORT = true;
    EXITSTATUS = status;
    STACKTOP = initialStackTop;

    exitRuntime();

    if (Module['onExit']) Module['onExit'](status);
  }

  if (ENVIRONMENT_IS_NODE) {
    process['exit'](status);
  }
  Module['quit'](status, new ExitStatus(status));
}
Module['exit'] = exit;

var abortDecorators = [];

function abort(what) {
  if (Module['onAbort']) {
    Module['onAbort'](what);
  }

  if (what !== undefined) {
    Module.print(what);
    Module.printErr(what);
    what = JSON.stringify(what)
  } else {
    what = '';
  }

  ABORT = true;
  EXITSTATUS = 1;

  var extra = '';
  var output = 'abort(' + what + ') at ' + stackTrace() + extra;
  if (abortDecorators) {
    abortDecorators.forEach(function(decorator) {
      output = decorator(output, what);
    });
  }
  throw output;
}
Module['abort'] = abort;

// {{PRE_RUN_ADDITIONS}}

if (Module['preInit']) {
  if (typeof Module['preInit'] == 'function') Module['preInit'] = [Module['preInit']];
  while (Module['preInit'].length > 0) {
    Module['preInit'].pop()();
  }
}

// shouldRunNow refers to calling main(), not run().
var shouldRunNow = true;
if (Module['noInitialRun']) {
  shouldRunNow = false;
}

Module["noExitRuntime"] = true;

run();

// {{POST_RUN_ADDITIONS}}





// {{MODULE_ADDITIONS}}



