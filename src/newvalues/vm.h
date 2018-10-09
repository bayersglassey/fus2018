#ifndef _FUS_VM_H_
#define _FUS_VM_H_

#include "core.h"
#include "class.h"
#include "array.h"
#include "value.h"


/* The following macro can be passed another macro */
#define FUS_VM_CLASSES_DO(M) \
    M(int) \
    M(fus_int_t)

#define FUS_VM_CLASS_DECL(T) \
    fus_class_t class_##T;

#define FUS_VM_CLASS_INIT(T) \
    err = fus_class_init_zero(&vm->class_##T, core, #T, sizeof(T)); \
    if(err)return err;

#define FUS_VM_CLASS_CLEANUP(T) \
    fus_class_cleanup(&vm->class_##T);


typedef struct fus_vm {
    fus_core_t *core;
    FUS_VM_CLASSES_DO(FUS_VM_CLASS_DECL)
} fus_vm_t;

int fus_vm_init(fus_vm_t *vm, fus_core_t *core){
    int err;
    vm->core = core;
    FUS_VM_CLASSES_DO(FUS_VM_CLASS_INIT)
    return 0;
}

void fus_vm_cleanup(fus_vm_t *vm){
    FUS_VM_CLASSES_DO(FUS_VM_CLASS_CLEANUP)
}


#endif