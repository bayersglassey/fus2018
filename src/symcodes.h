#ifndef _FUS_SYMCODES_H_
#define _FUS_SYMCODES_H_

enum {
    #define DEF_SYMCODE(code, token) FUS_SYMCODE_##code,
    #include "symcodes.inc"
    #undef DEF_SYMCODE
    FUS_SYMCODES
};


#endif