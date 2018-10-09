#ifndef _FUS_VM_H_
#define _FUS_VM_H_

#include "core.h"
#include "class.h"
#include "array.h"

typedef struct fus_vm {
    fus_core_t *core;
    fus_class_t class_int;
} fus_vm_t;

int fus_vm_init(fus_vm_t *vm, fus_core_t *core){
    int err;
    vm->core = core;

    err = fus_class_init_zero(&vm->class_int, core, "int", sizeof(int));
    if(err)return err;

    return 0;
}

void fus_vm_cleanup(fus_vm_t *vm){
    fus_class_cleanup(&vm->class_int);
}


#endif