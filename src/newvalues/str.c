

#include "includes.h"



void fus_str_init(fus_str_t *s, fus_vm_t *vm,
    char *text, size_t len
){
    s->text = text;
    s->len = len;
}

void fus_str_cleanup(fus_str_t *s){
    free(s->text);
}


size_t fus_str_len(fus_str_t *s){
    return s->len;
}



fus_value_t fus_value_str(fus_vm_t *vm){
    /* Creates a new, empty str value. */
    fus_boxed_t *p = fus_malloc(vm->core, sizeof(*p));
    fus_boxed_init(p, vm, FUS_BOXED_STR);
    fus_str_init(&p->data.s, vm, NULL, 0);
    return (fus_value_t)p;
}

fus_value_t fus_value_str_len(fus_vm_t *vm, fus_value_t value){
    /* Return len of str value as a new int value */
    if(!fus_value_is_str(value))return fus_value_err(vm, FUS_ERR_WRONG_TYPE);
    return fus_value_int(vm, fus_str_len(&value.p->data.s));
}

const char *fus_value_str_decode(fus_value_t value){
    if(!fus_value_is_str(value)){
#if FUS_PRINT_ERRS_TO_STDERR
        fprintf(stderr, "{Fus error: %li is not a str}", value.i);
#endif
        return NULL;
    }
    return value.p->data.s.text;
}


