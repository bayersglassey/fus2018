#ifndef _FUS_SYMCODES_H_
#define _FUS_SYMCODES_H_


#define FUS_SYMCODE_ARGTYPE_NOT_OPCODE 0
#define FUS_SYMCODE_ARGTYPE_NONE 1
#define FUS_SYMCODE_ARGTYPE_INT 2
#define FUS_SYMCODE_ARGTYPE_SYM 3
#define FUS_SYMCODE_ARGTYPE_OTHER 4


enum {
    #define DEF_SYMCODE(code, token, argtype, autocompile) FUS_SYMCODE_##code,
    #include "symcodes.inc"
    #undef DEF_SYMCODE
    FUS_SYMCODES
};


#endif