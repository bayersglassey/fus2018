

#include "includes.h"



#define FUS_BOXED_LOG_WEIRD_TYPE(type) \
    fprintf(stderr, "%s: Got weird boxed type: %i\n", __func__, type);

const char *fus_boxed_type_msg(fus_boxed_type_t type){
    static const char *types[FUS_BOXEDS] = {
        "arr",
        "obj",
        "str",
        "fun"
    };
    if(type < 0 || type >= FUS_BOXEDS)return "Unknown";
    return types[type];
}

void fus_boxed_dump(fus_boxed_t *p, FILE *file){
    fprintf(file, "address=%p, type=%s, refcount=%i\n",
        p, fus_boxed_type_msg(p->type), p->refcount);
}

void fus_boxed_init(fus_boxed_t *p, fus_vm_t *vm,
    fus_boxed_type_t type
){
    if(p == NULL)return;
    p->vm = vm;
    p->type = type;
    p->refcount = 1;
    vm->n_boxed++;

#ifdef FUS_ENABLE_BOXED_LLIST
    /* Hook p up to vm's linked list of boxed_t */
    p->prev = NULL;
    p->next = vm->boxed_llist;
    if(p->next)p->next->prev = p;
    vm->boxed_llist = p;
#endif
}

void fus_boxed_cleanup(fus_boxed_t *p){
    if(p == NULL)return;
    if(p->refcount != 0){
        fprintf(stderr, "%s: WARNING: "
            "Cleanup of value with nonzero refcount: ", __func__);
        fus_boxed_dump(p, stderr);
        FUS_BACKTRACE
        fflush(stderr);
    }

    fus_vm_t *vm = p->vm;
    vm->n_boxed--;

#ifdef FUS_ENABLE_BOXED_LLIST
    /* Unhook p from vm's linked list of boxed_t */
    fus_boxed_t *prev = p->prev;
    fus_boxed_t *next = p->next;
    if(prev)prev->next = next;
    if(next)next->prev = prev;
    if(vm->boxed_llist == p)vm->boxed_llist = next;
#endif

    fus_boxed_type_t type = p->type;
    if(type == FUS_BOXED_ARR){
        fus_arr_t *a = &p->data.a;
        fus_arr_cleanup(vm, a);
    }else if(type == FUS_BOXED_OBJ){
        fus_obj_t *o = &p->data.o;
        fus_obj_cleanup(vm, o);
    }else if(type == FUS_BOXED_STR){
        fus_str_t *s = &p->data.s;
        fus_str_cleanup(vm, s);
    }else if(type == FUS_BOXED_FUN){
        fus_fun_t *f = &p->data.f;
        fus_fun_cleanup(vm, f);
    }else{
        FUS_BOXED_LOG_WEIRD_TYPE(type)
    }
    fus_free(p->vm->core, p);
}

void fus_boxed_attach(fus_boxed_t *p){
    p->refcount++;
}

void fus_boxed_detach(fus_boxed_t *p){
    p->refcount--;
    if(p->refcount <= 0){
        if(p->refcount < 0){
            fprintf(stderr, "%s: WARNING: "
                "Boxed value's refcount has gone negative: ",
                __func__);
            fus_boxed_dump(p, stderr);
            fflush(stderr);
        }
        fus_boxed_cleanup(p);
    }
}

