
#include "includes.h"



#define FUS_VM_SIMPLE_CLASS_INIT(NAME, T) \
    fus_class_init_zero(&vm->class_##NAME, core, #NAME, sizeof(T), vm);

#define FUS_VM_CLASS_INIT(NAME, T) \
    fus_class_init(&vm->class_##NAME, core, #NAME, sizeof(T), vm, \
        &fus_class_init_##NAME, \
        &fus_class_cleanup_##NAME);

#define FUS_VM_CLASS_CLEANUP(NAME, T) \
    fus_class_cleanup(&vm->class_##NAME);


void fus_vm_init(fus_vm_t *vm, fus_core_t *core,
    fus_symtable_t *symtable
){
    vm->core = core;
    vm->symtable = symtable;
    vm->n_boxed = 0;

#ifdef FUS_ENABLE_BOXED_LLIST
    vm->boxed_llist = NULL;
#endif

    FUS_VM_SIMPLE_CLASSES_DO(FUS_VM_SIMPLE_CLASS_INIT)
    FUS_VM_CLASSES_DO(FUS_VM_CLASS_INIT)
}

void fus_vm_cleanup(fus_vm_t *vm){
    if(vm->n_boxed != 0){
        fprintf(stderr, "%s: WARNING: "
            "Cleanup of vm with nonzero n_boxed: %i\n",
            __func__, vm->n_boxed);
        for(fus_boxed_t *p = vm->boxed_llist; p != NULL; p = p->next){
            fprintf(stderr, "  %s addr=%p refcount=%i\n",
                fus_value_type_msg((fus_value_t)p), p, p->refcount);
        }
        fflush(stderr);
    }

    FUS_VM_SIMPLE_CLASSES_DO(FUS_VM_CLASS_CLEANUP)
    FUS_VM_CLASSES_DO(FUS_VM_CLASS_CLEANUP)
}


void fus_vm_error(fus_vm_t *vm, fus_err_code_t code){
#if FUS_PRINT_ERRS_TO_STDERR
    const char *msg = fus_err_code_msg(code);
    fprintf(stderr, "{Fus err #%i: %s}", code, msg);
#if FUS_PRINT_BACKTRACE_WITH_ERRS
    fprintf(stderr, "\n"); FUS_BACKTRACE
#endif
#endif
#if FUS_USE_CURRENT_ERR_CODE
    fus_current_err_code = code;
#endif
#if FUS_EXIT_ON_ERR
    fus_exit(vm->core, EXIT_FAILURE);
#endif
}
