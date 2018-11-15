
#include "includes.h"



int fus_symcode_argtype_get_size(int argtype){
    int size = 1;
    if(
        argtype == FUS_SYMCODE_ARGTYPE_INT ||
        argtype == FUS_SYMCODE_ARGTYPE_SYM ||
        argtype == FUS_SYMCODE_ARGTYPE_JUMP
    ){
        size += FUS_CODE_OPCODES_PER_INT;
    }
    return size;
}
