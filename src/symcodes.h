#ifndef _FUS_SYMCODES_H_
#define _FUS_SYMCODES_H_


enum {
    FUS_SYMCODE_ARGTYPE_NOT_OPCODE,
    FUS_SYMCODE_ARGTYPE_NONE,
    FUS_SYMCODE_ARGTYPE_INT,
    FUS_SYMCODE_ARGTYPE_SYM,
    FUS_SYMCODE_ARGTYPE_OTHER,
    FUS_SYMCODE_ARGTYPES
};


enum {
    #define DEF_SYMCODE(code, token, argtype, autocompile) FUS_SYMCODE_##code,
    #include "symcodes.inc"
    #undef DEF_SYMCODE
    FUS_SYMCODES
};


int fus_symcode_argtype_get_size(int argtype);


#endif