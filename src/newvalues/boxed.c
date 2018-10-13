

#include "includes.h"



#define FUS_BOXED_LOG_WEIRD_TYPE(type) \
    fprintf(stderr, "%s: Got weird boxed type: %i\n", __func__, type);

void fus_boxed_dump(fus_boxed_t *p, FILE *file){
    fprintf(file, "address=%p, type=%i, refcount=%i\n",
        p, p->type, p->refcount);
}

void fus_boxed_init(fus_boxed_t *p, fus_vm_t *vm,
    fus_boxed_type_t type
){
    if(p == NULL)return;
    p->type = type;
    p->refcount = 0;
    if(type == FUS_BOXED_ARR){
        fus_arr_t *a = &p->data.a;
        fus_array_init(&a->values, &vm->class_value);
    }else if(type == FUS_BOXED_OBJ){
        fus_obj_t *o = &p->data.o;
        fus_array_init(&o->keys, &vm->class_sym_i);
        fus_array_init(&o->values, &vm->class_value);
    }else if(type == FUS_BOXED_STR){
        fus_str_t *s = &p->data.s;
        fus_array_init(&s->text, &vm->class_char);
    }else if(type == FUS_BOXED_FUN){
        /* TODO... */
    }else{
        FUS_BOXED_LOG_WEIRD_TYPE(type)
    }
}

void fus_boxed_cleanup(fus_boxed_t *p){
    if(p == NULL)return;
    if(p->refcount != 0){
        fprintf(stderr, "%s: WARNING: "
            "Cleanup of value with nonzero refcount: ", __func__);
        fus_boxed_dump(p, stderr);
        fflush(stderr);
    }
    fus_boxed_type_t type = p->type;
    if(type == FUS_BOXED_ARR){
        fus_arr_t *a = &p->data.a;
        fus_array_cleanup(&a->values);
    }else if(type == FUS_BOXED_OBJ){
        fus_obj_t *o = &p->data.o;
        fus_array_cleanup(&o->keys);
        fus_array_cleanup(&o->values);
    }else if(type == FUS_BOXED_STR){
        fus_str_t *s = &p->data.s;
        fus_array_cleanup(&s->text);
    }else if(type == FUS_BOXED_FUN){
        /* TODO... */
    }else{
        FUS_BOXED_LOG_WEIRD_TYPE(type)
    }
}


/*******
 * ARR *
 *******/

void fus_arr_init(fus_arr_t *a, fus_vm_t *vm){
    fus_array_init(&a->values, &vm->class_value);
}

void fus_arr_cleanup(fus_arr_t *a){
    fus_array_cleanup(&a->values);
}

bool fus_is_arr(fus_value_t value){
    return FUS_IS_UNBOXED(value) && value.p->type == FUS_BOXED_ARR;
}

fus_value_t fus_arr(fus_vm_t *vm){
    fus_boxed_t *p = fus_malloc(vm->core, sizeof(*p));
    fus_boxed_init(p, vm, FUS_BOXED_ARR);
    fus_arr_init(&p->data.a, vm);
    return (fus_value_t)p;
}

fus_value_t fus_arr_len(fus_vm_t *vm, fus_value_t value){
    if(!fus_is_arr(value))return fus_err(vm, FUS_ERR_WRONG_TYPE);
    return fus_int(vm, value.p->data.a.values.len);
}

