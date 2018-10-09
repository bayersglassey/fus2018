#ifndef _FUS_VM_H_
#define _FUS_VM_H_

#include "core.h"
#include "class.h"
#include "array.h"
#include "value.h"


/* The following macro can be passed another macro */
#define FUS_VM_SIMPLE_CLASSES_DO(M) \
    M(char, char) \
    M(sym_i, fus_sym_i_t)

/* The following macro can be passed another macro */
#define FUS_VM_CLASSES_DO(M) \
    M(value, fus_value_t)

#define FUS_VM_CLASS_DECL(NAME, T) \
    fus_class_t class_##NAME;

#define FUS_VM_CLASS_INIT(NAME, T) \
    fus_class_init_zero(&vm->class_##NAME, core, #NAME, sizeof(T));

#define FUS_VM_CLASS_CLEANUP(NAME, T) \
    fus_class_cleanup(&vm->class_##NAME);


typedef struct fus_vm {
    fus_core_t *core;
    FUS_VM_SIMPLE_CLASSES_DO(FUS_VM_CLASS_DECL)
    FUS_VM_CLASSES_DO(FUS_VM_CLASS_DECL)
} fus_vm_t;

void fus_vm_init(fus_vm_t *vm, fus_core_t *core){
    vm->core = core;

    FUS_VM_SIMPLE_CLASSES_DO(FUS_VM_CLASS_INIT)

    /* Init non-simple classes: */
    fus_class_init(&vm->class_value, core,
        "value", sizeof(fus_value_t),
        &fus_class_init_value,
        &fus_class_cleanup_value);
}

void fus_vm_cleanup(fus_vm_t *vm){
    FUS_VM_SIMPLE_CLASSES_DO(FUS_VM_CLASS_CLEANUP)
    FUS_VM_CLASSES_DO(FUS_VM_CLASS_CLEANUP)
}


#endif